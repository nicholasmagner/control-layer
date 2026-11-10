'use client';

import { CheckCircle2, ExternalLink, KeyRound, LogIn, Play, Terminal } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { AppData } from '@/lib/data';
import { api, Button, cx, ErrorText, Field, inputCls, Modal } from './ui';

type Info = AppData['connectors'][number];
type Job = { id: string; status: 'running' | 'succeeded' | 'failed' | 'cancelled'; output: string; urls: string[]; code: string | null; error: string | null };
type Choice = { id: string; label: string };
type Step = 'choose' | 'signin' | 'pick' | 'keys' | 'done';

export const AWS_REGIONS = [
  'us-east-1', 'us-east-2', 'us-west-1', 'us-west-2', 'ca-central-1', 'sa-east-1',
  'eu-west-1', 'eu-west-2', 'eu-west-3', 'eu-central-1', 'eu-north-1',
  'ap-south-1', 'ap-southeast-1', 'ap-southeast-2', 'ap-northeast-1',
];

const CLI_LABEL: Record<string, string> = { aws: 'AWS CLI', gcloud: 'Google Cloud CLI (gcloud)', az: 'Azure CLI', gh: 'GitHub CLI (gh)' };

export default function ConnectModal({ info, features, onClose, onChanged }: {
  info: Info;
  features: AppData['features'];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [step, setStep] = useState<Step>(info.cli ? 'choose' : 'keys');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [accountId, setAccountId] = useState('');
  const [regions, setRegions] = useState<string[]>(['us-east-1']);
  const [label, setLabel] = useState('');
  const [scan, setScan] = useState<string>('');
  const [reply, setReply] = useState('');
  const outRef = useRef<HTMLPreElement>(null);
  const isAws = info.provider === 'aws';

  // --- Browser sign-in ------------------------------------------------------
  async function startSignin() {
    setError('');
    setBusy(true);
    try {
      const j = await api<Job>(`/api/connectors/${info.provider}/signin`, { method: 'POST', json: { action: 'start', awsRegion: regions[0] } });
      setJob(j);
      setStep('signin');
      // On the desktop app the CLI opens the browser itself; elsewhere the link is shown below.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const loadChoices = useCallback(async () => {
    setError('');
    try {
      const r = await api<{ choices: Choice[] }>(`/api/connectors/${info.provider}/accounts`);
      setChoices(r.choices);
      setAccountId(r.choices[0]?.id ?? '');
      setStep('pick');
    } catch (err) {
      setError((err as Error).message);
    }
  }, [info.provider]);

  useEffect(() => {
    if (step !== 'signin' || !job || job.status !== 'running') return;
    const t = setInterval(async () => {
      try {
        const j = await api<Job>(`/api/connectors/${info.provider}/signin?job=${job.id}`);
        setJob(j);
        if (j.status === 'succeeded') loadChoices();
      } catch { /* keep polling */ }
    }, 1500);
    return () => clearInterval(t);
  }, [step, job, info.provider, loadChoices]);

  useEffect(() => { outRef.current?.scrollTo({ top: outRef.current.scrollHeight }); }, [job?.output]);

  async function sendReply(e: FormEvent) {
    e.preventDefault();
    if (!job || !reply.trim()) return;
    try {
      setJob(await api<Job>(`/api/connectors/${info.provider}/signin`, { method: 'POST', json: { action: 'input', job: job.id, text: reply.trim() } }));
      setReply('');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function cancel() {
    if (job?.status === 'running') {
      await api(`/api/connectors/${info.provider}/signin`, { method: 'POST', json: { action: 'cancel', job: job.id } }).catch(() => undefined);
    }
    onClose();
  }

  // --- Save -----------------------------------------------------------------
  async function save(body: Record<string, unknown>) {
    setError('');
    setBusy(true);
    try {
      const r = await api<{ label: string }>(`/api/connectors/${info.provider}`, { method: 'PUT', json: body });
      setLabel(r.label);
      setStep('done');
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runScan() {
    setBusy(true);
    setScan('Scanning… this can take a minute.');
    try {
      const res = await fetch('/api/scans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: info.provider }) });
      const s = await res.json();
      setScan(s.ok ? `Done: ${s.checksEvaluated} checks, ${s.failed} failing resources, ${s.newFindings} new findings.` : `Scan failed: ${s.error}`);
      onChanged();
    } catch (err) {
      setScan((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const regionPicker = isAws && (
    <Field label="Regions to scan" hint="IAM, S3 and CloudTrail are checked account-wide; servers and databases in the regions you pick.">
      <div className="flex flex-wrap gap-1.5">
        {AWS_REGIONS.map(r => (
          <button type="button" key={r} onClick={() => setRegions(regions.includes(r) ? regions.filter(x => x !== r) : [...regions, r])}
            className={cx('rounded-md border px-2 py-1 font-mono text-xs', regions.includes(r) ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-slate-700 text-slate-400 hover:border-slate-500')}>
            {r}
          </button>
        ))}
      </div>
    </Field>
  );

  return (
    <Modal title={`Connect ${info.name}`} onClose={cancel} wide>
      {step === 'choose' && (
        <div className="space-y-4">
          <p className="text-sm text-slate-400">ControlLayer only reads settings; it never changes anything in {info.name}.</p>
          {info.cli && <button disabled={!info.cli.installed || busy} onClick={startSignin}
            className="flex w-full items-start gap-4 rounded-xl border border-slate-700 p-5 text-left transition-colors hover:border-sky-500/60 hover:bg-sky-500/5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-slate-700 disabled:hover:bg-transparent">
            <LogIn className="mt-0.5 shrink-0 text-sky-400" />
            <span className="flex-1">
              <span className="block font-semibold text-slate-100">Sign in with your browser {features.localInstall && <span className="ml-2 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] text-sky-300">Easiest</span>}</span>
              <span className="mt-1 block text-sm text-slate-400">{info.setup.signinNote}</span>
              {!info.cli.installed && (
                <span className="mt-2 block text-sm text-amber-300">
                  Needs the {CLI_LABEL[info.cli.name]} on {features.localInstall ? 'this computer' : 'the ControlLayer server'}.{' '}
                  <a href={info.cli.installUrl} target="_blank" rel="noreferrer" className="underline" onClick={e => e.stopPropagation()}>Install it</a>, then reopen this window.
                </span>
              )}
            </span>
          </button>}
          <button disabled={!features.canStoreKeys} onClick={() => setStep('keys')}
            className="flex w-full items-start gap-4 rounded-xl border border-slate-700 p-5 text-left transition-colors hover:border-sky-500/60 hover:bg-sky-500/5 disabled:cursor-not-allowed disabled:opacity-60">
            <KeyRound className="mt-0.5 shrink-0 text-sky-400" />
            <span className="flex-1">
              <span className="block font-semibold text-slate-100">Use {info.setup.keyName}</span>
              <span className="mt-1 block text-sm text-slate-400">Best for automatic scheduled scans. {info.setup.permissions} Stored encrypted.</span>
              {!features.canStoreKeys && <span className="mt-2 block text-sm text-amber-300">Unavailable: the server has no CONTROLLAYER_SECRET_KEY to encrypt keys with.</span>}
            </span>
          </button>
          {isAws && info.cli?.installed && <div className="pt-1">{regionPicker}</div>}
          <ErrorText>{error}</ErrorText>
        </div>
      )}

      {step === 'signin' && job && (
        <div className="space-y-4">
          {job.status === 'running' && (
            <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-slate-200">
              {features.localInstall
                ? <p><strong>A browser window has opened.</strong> Sign in there, then come back. This window updates by itself.</p>
                : <p><strong>Open the sign-in link</strong>, sign in, and if a code is shown, paste it in the box below.</p>}
              {job.code && (
                <p className="mt-3">Your code: <span className="rounded bg-slate-950 px-2 py-1 font-mono text-lg tracking-widest text-sky-300">{job.code}</span></p>
              )}
              {job.urls[0] && (
                <a href={job.urls[0]} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500">
                  <ExternalLink size={14} /> {features.localInstall ? 'Browser didn’t open? Open the sign-in page' : 'Open the sign-in page'}
                </a>
              )}
            </div>
          )}
          {job.status === 'succeeded' && !error && <p className="text-sm text-emerald-300">Signed in. Loading your {info.setup.pickWord}s…</p>}
          {(job.status === 'failed' || job.status === 'cancelled') && <ErrorText>{job.error ?? 'Sign-in was cancelled.'}</ErrorText>}

          <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-1.5 text-xs text-slate-500"><Terminal size={12} /> {CLI_LABEL[info.cli?.name ?? '']}</div>
            <pre ref={outRef} className="max-h-48 overflow-y-auto whitespace-pre-wrap break-all p-3 font-mono text-xs leading-relaxed text-slate-300">{job.output || 'Starting…'}</pre>
            {job.status === 'running' && (
              <form onSubmit={sendReply} className="flex border-t border-slate-800">
                <span className="px-3 py-2 font-mono text-xs text-sky-400">&gt;</span>
                <input value={reply} onChange={e => setReply(e.target.value)} autoComplete="off" spellCheck={false}
                  placeholder="Type an answer if the tool asks for one (e.g. a code, or y), then press Enter"
                  className="flex-1 bg-transparent py-2 pr-3 font-mono text-xs text-slate-200 outline-none placeholder:text-slate-600" />
              </form>
            )}
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            {(job.status === 'failed' || job.status === 'cancelled') && <Button variant="secondary" onClick={() => setStep('choose')}>Back</Button>}
            {job.status === 'succeeded' && error && <Button variant="secondary" onClick={loadChoices}>Try again</Button>}
            <Button variant="ghost" onClick={cancel}>{job.status === 'running' ? 'Cancel' : 'Close'}</Button>
          </div>
        </div>
      )}

      {step === 'pick' && (
        <form className="space-y-5" onSubmit={e => { e.preventDefault(); save({ method: 'signin', accountId, regions }); }}>
          <p className="text-sm text-emerald-300">Signed in.</p>
          {choices.length === 0 ? (
            <ErrorText>The signed-in user can&apos;t see any {info.setup.pickWord}s{info.provider === 'github' ? ' (organization owners and members only; personal accounts are not supported)' : ''}. Sign in with a different account.</ErrorText>
          ) : (
            <Field label={isAws ? 'Account' : `${info.setup.pickWord[0].toUpperCase()}${info.setup.pickWord.slice(1)} to scan`}>
              <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-800 p-2">
                {choices.map(c => (
                  <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-slate-800/60">
                    <input type="radio" name="account" checked={accountId === c.id} onChange={() => setAccountId(c.id)} className="accent-sky-500" />
                    <span className="text-slate-200">{c.label}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}
          {regionPicker}
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={cancel}>Cancel</Button>
            <Button type="submit" disabled={busy || !accountId || (isAws && regions.length === 0)}>{busy ? 'Checking…' : 'Connect'}</Button>
          </div>
        </form>
      )}

      {step === 'keys' && <KeysForm info={info} busy={busy} error={error} regionPicker={regionPicker} regions={regions} canStoreKeys={features.canStoreKeys}
        onBack={info.cli ? () => { setError(''); setStep('choose'); } : cancel} onSave={save} onError={setError} />}

      {step === 'done' && (
        <div className="space-y-5 text-center">
          <CheckCircle2 className="mx-auto text-emerald-400" size={40} />
          <div>
            <p className="text-lg font-semibold text-slate-100">Connected</p>
            <p className="text-sm text-slate-400">{label}</p>
          </div>
          {scan && <p className="rounded-lg bg-slate-950/60 p-3 text-sm text-slate-300">{scan}</p>}
          <div className="flex justify-center gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button onClick={runScan} disabled={busy}><Play size={14} /> {busy ? 'Scanning…' : 'Run first scan'}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function KeysForm({ info, busy, error, regionPicker, regions, canStoreKeys, onBack, onSave, onError }: {
  info: Info; busy: boolean; error: string; regionPicker: React.ReactNode; regions: string[]; canStoreKeys: boolean;
  onBack: () => void; onSave: (body: Record<string, unknown>) => void; onError: (m: string) => void;
}) {
  const [f, setF] = useState<Record<string, string>>({});
  const [keyFile, setKeyFile] = useState<Record<string, unknown> | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function readKeyFile(file: File | undefined) {
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      if (json.type !== 'service_account') throw new Error();
      setKeyFile(json);
      onError('');
    } catch {
      setKeyFile(null);
      onError('That file is not a Google Cloud service account key (JSON).');
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (info.provider === 'aws') onSave({ method: 'keys', accessKeyId: f.accessKeyId, secretAccessKey: f.secretAccessKey, regions });
    else if (info.provider === 'gcp') onSave({ method: 'keys', keyFile });
    else if (info.provider === 'gworkspace') onSave({ method: 'keys', keyFile, adminEmail: f.adminEmail });
    else if (info.provider === 'github') onSave({ method: 'keys', token: f.token, org: f.org });
    else if (info.provider === 'm365') onSave({ method: 'keys', tenantId: f.tenantId, clientId: f.clientId, clientSecret: f.clientSecret });
    else if (info.provider === 'ad') onSave({ method: 'keys', url: f.url, username: f.username, password: f.password, baseDn: f.baseDn, caCert: f.caCert, startTls: f.startTls !== 'off' });
    else onSave({ method: 'keys', tenantId: f.tenantId, clientId: f.clientId, clientSecret: f.clientSecret, subscriptionId: f.subscriptionId });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <details className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-sm" open>
        <summary className="cursor-pointer font-medium text-slate-200">How to create one (about 2 minutes)</summary>
        <ol className="mt-3 list-inside list-decimal space-y-1.5 text-slate-400">{info.setup.keyHelp.map(s => <li key={s}>{s}</li>)}</ol>
        {info.setup.consoleUrl && (
          <a href={info.setup.consoleUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-sky-400 hover:text-sky-300">
            Open the {info.setup.consoleName} <ExternalLink size={13} />
          </a>
        )}
      </details>

      {info.provider === 'aws' && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Access key ID"><input className={inputCls} required autoComplete="off" spellCheck={false} placeholder="AKIA…" onChange={set('accessKeyId')} /></Field>
            <Field label="Secret access key"><input className={inputCls} required type="password" autoComplete="off" onChange={set('secretAccessKey')} /></Field>
          </div>
          {regionPicker}
        </>
      )}
      {!canStoreKeys && <ErrorText>Unavailable: the server has no CONTROLLAYER_SECRET_KEY to encrypt keys with.</ErrorText>}
      {(info.provider === 'gcp' || info.provider === 'gworkspace') && (
        <Field label="Service account key file (.json)">
          <input type="file" accept="application/json,.json" required onChange={e => readKeyFile(e.target.files?.[0])}
            className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" />
          {keyFile && <span className="mt-1 block text-xs text-emerald-400">Project: {String(keyFile.project_id)} · {String(keyFile.client_email)}</span>}
        </Field>
      )}
      {info.provider === 'gworkspace' && (
        <Field label="Admin email" hint="A Google Workspace admin the service account acts as. ControlLayer only reads the user directory.">
          <input className={inputCls} required type="email" autoComplete="off" spellCheck={false} placeholder="admin@yourcompany.com" onChange={set('adminEmail')} />
        </Field>
      )}
      {info.provider === 'github' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Organization" hint="As in github.com/your-org"><input className={inputCls} required spellCheck={false} placeholder="your-org" onChange={set('org')} /></Field>
          <Field label="Personal access token"><input className={inputCls} required type="password" autoComplete="off" placeholder="ghp_…" onChange={set('token')} /></Field>
        </div>
      )}
      {info.provider === 'ad' && (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Domain controller" hint="ldaps://dc01.corp.example.com (port 636) or ldap://… with StartTLS">
              <input className={inputCls} required spellCheck={false} placeholder="ldaps://dc01.corp.example.com" onChange={set('url')} />
            </Field>
            <Field label="Base DN (optional)" hint="Found automatically when empty">
              <input className={inputCls} spellCheck={false} placeholder="DC=corp,DC=example,DC=com" onChange={set('baseDn')} />
            </Field>
            <Field label="Username" hint="e.g. svc-controllayer@corp.example.com or CORP\svc-controllayer">
              <input className={inputCls} required autoComplete="off" spellCheck={false} onChange={set('username')} />
            </Field>
            <Field label="Password"><input className={inputCls} required type="password" autoComplete="off" onChange={set('password')} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-300">
            <input type="checkbox" defaultChecked onChange={e => setF({ ...f, startTls: e.target.checked ? 'on' : 'off' })} />
            Use StartTLS for ldap:// addresses (encrypts the connection)
          </label>
          <Field label="Internal CA certificate (optional, PEM)" hint="Only needed if your domain controllers use certificates from your own certificate authority.">
            <textarea className={`${inputCls} h-20 font-mono text-xs`} spellCheck={false} placeholder="-----BEGIN CERTIFICATE-----" onChange={e => setF({ ...f, caCert: e.target.value })} />
          </Field>
        </div>
      )}
      {info.provider === 'm365' && (
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Directory (tenant) ID"><input className={inputCls} required spellCheck={false} onChange={set('tenantId')} /></Field>
          <Field label="Application (client) ID"><input className={inputCls} required spellCheck={false} onChange={set('clientId')} /></Field>
          <Field label="Client secret value"><input className={inputCls} required type="password" autoComplete="off" onChange={set('clientSecret')} /></Field>
        </div>
      )}
      {info.provider === 'azure' && (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Directory (tenant) ID"><input className={inputCls} required spellCheck={false} onChange={set('tenantId')} /></Field>
          <Field label="Application (client) ID"><input className={inputCls} required spellCheck={false} onChange={set('clientId')} /></Field>
          <Field label="Client secret value"><input className={inputCls} required type="password" autoComplete="off" onChange={set('clientSecret')} /></Field>
          <Field label="Subscription ID"><input className={inputCls} required spellCheck={false} onChange={set('subscriptionId')} /></Field>
        </div>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onBack}>{info.cli ? 'Back' : 'Cancel'}</Button>
        <Button type="submit" disabled={busy || !canStoreKeys || ((info.provider === 'gcp' || info.provider === 'gworkspace') && !keyFile)}>{busy ? 'Checking…' : 'Check and connect'}</Button>
      </div>
    </form>
  );
}
