import { execFile, spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Provider } from '@/checks/types';
import { AWS_SIGNIN_PROFILE, isLocalInstall } from './config';

/**
 * Browser sign-in through each cloud's official command-line tool:
 *   AWS: aws login · Google Cloud: gcloud auth application-default login · Azure: az login
 * On the desktop app the tool opens the user's browser. On a server it uses
 * the tool's "open this link, paste the code" mode, and the dialog in
 * ControlLayer acts as the prompt.
 */

export type CliName = 'aws' | 'gcloud' | 'az';

function candidateDirs(): string[] {
  const home = homedir();
  const extra = process.platform === 'win32'
    ? [
      path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Amazon', 'AWSCLIV2'),
      path.join(process.env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin'),
      path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Cloud SDK', 'google-cloud-sdk', 'bin'),
      path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'Microsoft SDKs', 'Azure', 'CLI2', 'wbin'),
      path.join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Microsoft SDKs', 'Azure', 'CLI2', 'wbin'),
    ]
    : [
      '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/snap/bin',
      path.join(home, 'google-cloud-sdk', 'bin'), '/usr/local/google-cloud-sdk/bin',
      '/opt/homebrew/share/google-cloud-sdk/bin', '/usr/lib/google-cloud-sdk/bin', path.join(home, '.local', 'bin'),
    ];
  const fromPath = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  return [...new Set([...fromPath, ...extra])];
}

export function cliFileNames(name: CliName, platform = process.platform): string[] {
  if (platform !== 'win32') return [name];
  return name === 'aws' ? ['aws.exe', 'aws.cmd'] : [`${name}.cmd`, `${name}.exe`];
}

const found = new Map<CliName, { at: number; path: string | null }>();

/** Finds an installed CLI, including install locations missing from a desktop app's PATH. */
export async function findCli(name: CliName): Promise<string | null> {
  const cached = found.get(name);
  if (cached && Date.now() - cached.at < 30_000) return cached.path;
  let result: string | null = null;
  for (const dir of candidateDirs()) {
    for (const file of cliFileNames(name)) {
      const p = path.join(dir, file);
      try {
        if (existsSync(p) && statSync(p).isFile()) { result = p; break; }
      } catch { /* unreadable dir */ }
    }
    if (result) break;
  }
  found.set(name, { at: Date.now(), path: result });
  return result;
}

const CLI_FOR: Record<Provider, CliName> = { aws: 'aws', gcp: 'gcloud', azure: 'az' };
export const AWS_REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;

/** The sign-in command for each cloud. `local` = the browser is on this computer. */
export function signinCommand(provider: Provider, local: boolean): { args: string[]; env: Record<string, string> } {
  switch (provider) {
    case 'aws':
      return { args: ['login', '--profile', AWS_SIGNIN_PROFILE, ...(local ? [] : ['--remote'])], env: { AWS_PAGER: '' } };
    case 'gcp':
      return { args: ['auth', 'application-default', 'login', ...(local ? [] : ['--no-launch-browser'])], env: {} };
    case 'azure':
      // The interactive subscription picker would wait on a hidden prompt; ControlLayer asks instead.
      return { args: ['login', '--output', 'none', ...(local ? [] : ['--use-device-code'])], env: { AZURE_CORE_LOGIN_EXPERIENCE_V2: 'off' } };
  }
}

const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
const URL_RE = /https:\/\/[^\s"'<>)]+/g;

/** Links and one-time codes a person needs to act on, from CLI output. */
export function parseSigninOutput(text: string): { urls: string[]; code: string | null } {
  const clean = text.replace(ANSI, '');
  const urls = [...new Set(clean.match(URL_RE) ?? [])];
  const code = clean.match(/enter the code ([A-Z0-9-]{6,})/i)?.[1] ?? null;
  return { urls, code };
}

/** The most useful line to show when a sign-in fails. */
export function lastErrorLine(output: string): string | null {
  const lines = output.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const err = [...lines].reverse().find(l => /error|denied|failed|invalid|expired|not authorized/i.test(l));
  return err ? err.replace(/^(ERROR|error):\s*/, '').slice(0, 400) : null;
}

export interface SigninJob {
  id: string;
  provider: Provider;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  output: string;
  urls: string[];
  code: string | null;
  error: string | null;
  startedAt: number;
}

type Job = SigninJob & { child: ChildProcessWithoutNullStreams | null; timer?: NodeJS.Timeout };
const store = globalThis as unknown as { __clSigninJobs?: Map<string, Job> };
const jobs = (store.__clSigninJobs ??= new Map<string, Job>());

const view = (j: Job): SigninJob => ({
  id: j.id, provider: j.provider, status: j.status, output: j.output, urls: j.urls, code: j.code, error: j.error, startedAt: j.startedAt,
});

const run = (file: string, args: string[], env: NodeJS.ProcessEnv) => new Promise<void>((resolve, reject) => {
  execFile(file, args, { env, windowsHide: true, shell: process.platform === 'win32' && file.endsWith('.cmd') }, err => (err ? reject(err) : resolve()));
});

const quote = (p: string) => (process.platform === 'win32' && /\s/.test(p) ? `"${p}"` : p);

export async function startSignin(provider: Provider, opts: { awsRegion?: string } = {}): Promise<SigninJob> {
  const cliName = CLI_FOR[provider];
  const cli = await findCli(cliName);
  if (!cli) throw new Error(`The ${cliName} command-line tool is not installed on the computer running ControlLayer.`);

  // One sign-in per cloud at a time.
  for (const j of jobs.values()) if (j.provider === provider && j.status === 'running') cancelSignin(j.id);

  const { args, env } = signinCommand(provider, isLocalInstall());
  const childEnv = { ...process.env, ...env };
  if (provider === 'aws') {
    // `aws login` asks for a region on new profiles; set one first so it never waits on a hidden prompt.
    const region = opts.awsRegion && AWS_REGION_RE.test(opts.awsRegion) ? opts.awsRegion : 'us-east-1';
    await run(quote(cli), ['configure', 'set', 'region', region, '--profile', AWS_SIGNIN_PROFILE], childEnv);
  }

  const job: Job = {
    id: randomUUID(), provider, status: 'running', output: '', urls: [], code: null, error: null, startedAt: Date.now(), child: null,
  };
  const child = spawn(quote(cli), args, {
    env: childEnv, windowsHide: true, shell: process.platform === 'win32' && cli.endsWith('.cmd'),
  }) as ChildProcessWithoutNullStreams;
  job.child = child;

  const onData = (chunk: Buffer) => {
    job.output = (job.output + chunk.toString('utf8').replace(ANSI, '')).slice(-8000);
    const { urls, code } = parseSigninOutput(job.output);
    job.urls = urls;
    job.code = code ?? job.code;
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', err => {
    job.status = 'failed';
    job.error = err.message;
  });
  child.on('exit', code => {
    if (job.timer) clearTimeout(job.timer);
    job.child = null;
    if (job.status !== 'running') return;
    job.status = code === 0 ? 'succeeded' : 'failed';
    if (code !== 0) job.error = lastErrorLine(job.output) ?? `Sign-in did not complete (exit code ${code}).`;
  });
  job.timer = setTimeout(() => {
    if (job.status === 'running') {
      job.status = 'failed';
      job.error = 'Sign-in timed out after 10 minutes.';
      child.kill();
    }
  }, 10 * 60_000);

  jobs.set(job.id, job);
  return view(job);
}

export function getSignin(id: string): SigninJob | null {
  const j = jobs.get(id);
  return j ? view(j) : null;
}

/** Sends a line typed in the dialog (e.g. an authorization code) to the CLI. */
export function answerSignin(id: string, text: string) {
  const j = jobs.get(id);
  if (!j?.child || j.status !== 'running') throw new Error('This sign-in is no longer running.');
  j.child.stdin.write(`${text.replace(/[\r\n]/g, '')}\n`);
  j.output = `${j.output}\n> ••••••\n`.slice(-8000); // never echo what was typed (codes, tokens)
}

export function cancelSignin(id: string) {
  const j = jobs.get(id);
  if (!j) return;
  if (j.status === 'running') j.status = 'cancelled';
  j.child?.kill();
}
