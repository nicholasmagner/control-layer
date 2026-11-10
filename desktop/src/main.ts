import { app, BrowserWindow, dialog, Menu, shell, utilityProcess, type UtilityProcess } from 'electron';
import EmbeddedPostgres from 'embedded-postgres';
import { createWriteStream, existsSync, mkdirSync, type WriteStream } from 'node:fs';
import { createServer } from 'node:net';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { databaseSecret, loadSettings, paths, type Paths } from './config.js';
import { applyMigrations } from './migrate.js';

/**
 * ControlLayer desktop: runs a private PostgreSQL and the ControlLayer server
 * on this computer and shows the app in a window. All data stays in the
 * user's app-data folder (ControlLayer menu > Open Data Folder).
 */

const DB_NAME = 'controllayer';
const DB_USER = 'controllayer';

let window: BrowserWindow | null = null;
let postgres: EmbeddedPostgres | null = null;
let server: UtilityProcess | null = null;
let appUrl = '';
let shareUrl = '';
let quitting = false;
let logs: { app: WriteStream; server: WriteStream; db: WriteStream } | null = null;
// CONTROLLAYER_DATA_DIR lets IT admins (and tests) keep data somewhere else.
if (process.env.CONTROLLAYER_DATA_DIR) app.setPath('userData', path.resolve(process.env.CONTROLLAYER_DATA_DIR));
const P: Paths = paths(app.getPath('userData'));

const serverDir = () => (app.isPackaged
  ? path.join(process.resourcesPath, 'server')
  : path.resolve(import.meta.dirname, '..', '..', '.next', 'standalone'));

function log(stream: 'app' | 'server' | 'db', message: string) {
  const line = `[${new Date().toISOString()}] ${message.trimEnd()}\n`;
  logs?.[stream].write(line);
  if (!app.isPackaged) process.stdout.write(`${stream}: ${line}`);
}

function freePort(preferred: number, host: string): Promise<number> {
  const tryPort = (port: number) => new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once('error', reject);
    s.listen(port, host, () => {
      const { port: actual } = s.address() as { port: number };
      s.close(() => resolve(actual));
    });
  });
  return tryPort(preferred).catch(() => tryPort(0));
}

async function startDatabase(): Promise<string> {
  const { password } = databaseSecret(P);
  const port = await freePort(54329, '127.0.0.1');
  postgres = new EmbeddedPostgres({
    databaseDir: P.postgres,
    port,
    user: DB_USER,
    password,
    persistent: true,
    authMethod: 'scram-sha-256',
    onLog: (m: unknown) => log('db', String(m)),
    onError: (m: unknown) => log('db', `ERROR ${m instanceof Error ? m.message : String(m)}`),
  });
  if (!existsSync(path.join(P.postgres, 'PG_VERSION'))) {
    setStatus('Creating your local database (first start only)…');
    await postgres.initialise();
  }
  await postgres.start();

  const admin = postgres.getPgClient('postgres', '127.0.0.1');
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE "${DB_NAME}"`);
  await admin.end();

  const client = postgres.getPgClient(DB_NAME, '127.0.0.1');
  await client.connect();
  try {
    const applied = await applyMigrations(client, path.join(serverDir(), 'prisma', 'migrations'), m => log('app', m));
    if (applied) log('app', `Applied ${applied} database migration(s).`);
  } finally {
    await client.end();
  }
  return `postgresql://${DB_USER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${DB_NAME}`;
}

async function startServer(databaseUrl: string) {
  const settings = loadSettings(P);
  const shared = settings.ALLOW_NETWORK_ACCESS === 'true';
  const host = shared ? '0.0.0.0' : '127.0.0.1';
  const port = await freePort(Number(settings.PORT) || 3210, host);
  appUrl = `http://127.0.0.1:${port}`;
  const lan = Object.values(networkInterfaces()).flat().find(i => i && i.family === 'IPv4' && !i.internal)?.address;
  shareUrl = shared && lan ? `http://${lan}:${port}` : '';

  const dir = serverDir();
  server = utilityProcess.fork(path.join(dir, 'server.js'), [], {
    cwd: dir,
    serviceName: 'ControlLayer server',
    stdio: 'pipe',
    env: {
      ...process.env,
      ...settings,
      NODE_ENV: 'production',
      NEXT_TELEMETRY_DISABLED: '1',
      PORT: String(port),
      HOSTNAME: host,
      DATABASE_URL: databaseUrl,
    },
  });
  server.stdout?.on('data', d => log('server', String(d)));
  server.stderr?.on('data', d => log('server', String(d)));
  server.on('exit', code => {
    log('app', `Server exited with code ${code}`);
    server = null;
    if (!quitting) fail('The ControlLayer server stopped unexpectedly.');
  });

  // Wait until the server answers.
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${appUrl}/login`, { redirect: 'manual' });
      if (res.status < 500) return;
    } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error('The ControlLayer server did not start within 90 seconds.');
}

async function stopServer() {
  if (!server) return;
  const s = server;
  server = null;
  await new Promise<void>(resolve => {
    const t = setTimeout(resolve, 5000);
    s.once('exit', () => { clearTimeout(t); resolve(); });
    s.kill();
  });
}

async function shutdown() {
  quitting = true;
  await stopServer();
  if (postgres) {
    try { await postgres.stop(); } catch (err) { log('db', `stop failed: ${String(err)}`); }
    postgres = null;
  }
  logs?.app.end(); logs?.server.end(); logs?.db.end();
}

function setStatus(text: string) {
  window?.webContents.executeJavaScript(`document.getElementById('status') && (document.getElementById('status').textContent = ${JSON.stringify(text)})`).catch(() => undefined);
}

function fail(message: string, err?: unknown) {
  const detail = err instanceof Error ? err.message : err ? String(err) : '';
  log('app', `${message} ${detail}`);
  dialog.showErrorBox('ControlLayer', `${message}\n\n${detail}\n\nDetails are in the log files:\n${P.logs}`);
}

const LOADING_HTML = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta charset="utf-8"><title>ControlLayer</title>
<style>body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#020617;color:#e2e8f0;font-family:system-ui,sans-serif}
.box{text-align:center}h1{font-size:28px;margin:0 0 12px;background:linear-gradient(90deg,#38bdf8,#3b82f6);-webkit-background-clip:text;color:transparent}
p{color:#94a3b8;margin:0}.spin{width:28px;height:28px;margin:24px auto 0;border:3px solid #1e293b;border-top-color:#38bdf8;border-radius:50%;animation:s 1s linear infinite}
@keyframes s{to{transform:rotate(360deg)}}</style></head><body><div class="box"><h1>ControlLayer</h1><p id="status">Starting…</p><div class="spin"></div></div></body></html>`)}`;

async function boot() {
  try {
    setStatus('Starting the local database…');
    const databaseUrl = await startDatabase();
    setStatus('Starting ControlLayer…');
    await startServer(databaseUrl);
    await window?.loadURL(appUrl);
    buildMenu();
  } catch (err) {
    fail('ControlLayer could not start.', err);
    await shutdown();
    app.exit(1);
  }
}

async function restart() {
  if (!window) return;
  await window.loadURL(LOADING_HTML);
  setStatus('Restarting with your new settings…');
  quitting = true;
  await stopServer();
  quitting = false;
  try {
    const { password } = databaseSecret(P);
    const port = (postgres as unknown as { options: { port: number } }).options.port;
    await startServer(`postgresql://${DB_USER}:${encodeURIComponent(password)}@127.0.0.1:${port}/${DB_NAME}`);
    await window.loadURL(appUrl);
    buildMenu();
  } catch (err) {
    fail('ControlLayer could not restart.', err);
  }
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const appMenu: Electron.MenuItemConstructorOptions[] = [
    { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => shell.openPath(P.settings) },
    { label: 'Restart ControlLayer', click: () => restart() },
    { type: 'separator' },
    { label: 'Open in Web Browser', click: () => shell.openExternal(appUrl) },
    ...(shareUrl ? [{ label: `Shared on your network: ${shareUrl}`, click: () => shell.openExternal(shareUrl) }] : []),
    { label: 'Open Data Folder', click: () => shell.openPath(P.data) },
    { label: 'Open Logs Folder', click: () => shell.openPath(P.logs) },
  ];
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [{ label: 'ControlLayer', submenu: [{ role: 'about' as const }, { type: 'separator' as const }, ...appMenu, { type: 'separator' as const }, { role: 'hide' as const }, { role: 'quit' as const }] }]
      : [{ label: 'ControlLayer', submenu: [...appMenu, { type: 'separator' as const }, { role: 'quit' as const }] }]),
    { role: 'editMenu' },
    { label: 'View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'Documentation', click: () => shell.openExternal('https://github.com/nicholasmagner/ControlLayer-SOC-2-GRC-Analyst#readme') }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'ControlLayer',
    backgroundColor: '#020617',
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.once('ready-to-show', () => window?.show());
  // Links to other sites open in the user's browser; the window only shows ControlLayer.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (e, url) => {
    if (appUrl && !url.startsWith(appUrl) && !url.startsWith('data:')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  window.on('closed', () => { window = null; });
  window.loadURL(LOADING_HTML);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
  });

  app.whenReady().then(() => {
    mkdirSync(P.logs, { recursive: true });
    logs = {
      app: createWriteStream(path.join(P.logs, 'app.log'), { flags: 'a' }),
      server: createWriteStream(path.join(P.logs, 'server.log'), { flags: 'a' }),
      db: createWriteStream(path.join(P.logs, 'database.log'), { flags: 'a' }),
    };
    log('app', `ControlLayer ${app.getVersion()} starting (${process.platform} ${process.arch})`);
    buildMenu();
    createWindow();
    boot();
    app.on('activate', () => {
      if (!window) { createWindow(); if (appUrl) window!.loadURL(appUrl); }
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  let shuttingDown = false;
  app.on('before-quit', e => {
    if (shuttingDown) return;
    e.preventDefault();
    shuttingDown = true;
    shutdown().finally(() => app.exit(0));
  });
}
