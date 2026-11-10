// Launches the packaged app from release/, then uses it like a new customer:
// creates an admin, loads the sample company (renders 34 evidence images),
// exports an audit package, and quits. Exits non-zero on any failure.
//   node scripts/smoke-test.mjs   (Linux needs a display: xvfb-run -a ...)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const release = path.resolve(import.meta.dirname, '..', 'release');
const candidates = {
  linux: ['linux-unpacked/controllayer-desktop'],
  win32: ['win-unpacked/ControlLayer.exe'],
  darwin: ['mac-arm64/ControlLayer.app/Contents/MacOS/ControlLayer', 'mac/ControlLayer.app/Contents/MacOS/ControlLayer'],
}[process.platform].map(p => path.join(release, p));
const exe = candidates.find(existsSync);
if (!exe) throw new Error(`No packaged app found in ${release}`);

const dataDir = mkdtempSync(path.join(tmpdir(), 'controllayer-smoke-'));
const args = process.platform === 'linux' ? ['--no-sandbox'] : [];
console.log(`Launching ${exe}\n  data: ${dataDir}`);
const child = spawn(exe, args, { env: { ...process.env, CONTROLLAYER_DATA_DIR: dataDir }, stdio: 'inherit' });
let exited = false;
child.on('exit', code => { exited = true; console.log(`app exited (${code})`); });

const base = 'http://127.0.0.1:3210';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let cookie = '';
async function call(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map(c => c.split(';')[0]).join('; ');
  return res;
}

function stop() {
  if (exited) return;
  if (process.platform === 'win32') {
    try { execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F']); } catch { /* already gone */ }
  } else {
    child.kill('SIGTERM');
  }
}

try {
  const deadline = Date.now() + 180_000;
  let ready = false;
  while (Date.now() < deadline && !exited) {
    try { if ((await call('GET', '/setup')).status === 200) { ready = true; break; } } catch { /* starting */ }
    await sleep(1000);
  }
  if (!ready) throw new Error('App did not serve the setup page within 3 minutes.');
  console.log('✓ app started');

  let res = await call('POST', '/api/auth/setup', { name: 'Smoke Test', email: 'smoke@example.com', password: 'smoke-test-password-1' });
  if (!res.ok) throw new Error(`setup failed: ${res.status} ${await res.text()}`);
  console.log('✓ admin account created');

  res = await call('POST', '/api/sample-data');
  const sample = await res.json();
  if (!res.ok) throw new Error(`sample data failed: ${JSON.stringify(sample)}`);
  const images = sample.summaries.reduce((n, s) => n + s.imagesCreated, 0);
  const warnings = sample.summaries.flatMap(s => s.warnings);
  if (images !== 34 || warnings.length) throw new Error(`expected 34 evidence images, got ${images}; warnings: ${warnings.join(' | ')}`);
  console.log('✓ sample data loaded, 34 evidence images rendered');

  res = await call('GET', '/api/evidence/export?framework=SOC2');
  const zip = Buffer.from(await res.arrayBuffer());
  if (!res.ok || zip.length < 100_000 || zip.subarray(0, 2).toString() !== 'PK') throw new Error(`export failed: ${res.status}, ${zip.length} bytes`);
  console.log(`✓ audit package exported (${Math.round(zip.length / 1024)} KB)`);
} catch (err) {
  console.error(`✗ ${err.message}`);
  for (const f of ['app.log', 'server.log', 'database.log']) {
    const p = path.join(dataDir, 'logs', f);
    if (existsSync(p)) console.error(`--- ${f} ---\n${readFileSync(p, 'utf8').slice(-4000)}`);
  }
  process.exitCode = 1;
} finally {
  stop();
  for (let i = 0; i < 30 && !exited; i++) await sleep(500);
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* files may still be locked on Windows */ }
}
