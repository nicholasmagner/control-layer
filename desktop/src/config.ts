import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Desktop settings live in a plain text file in the app's data folder
 * (ControlLayer menu > Settings…). Values become environment variables for
 * the ControlLayer server, exactly like a .env file in a server install.
 */

export const SETTINGS_TEMPLATE = `# ControlLayer settings
# Edit this file, save it, then choose ControlLayer > Restart from the menu.
# Lines starting with # are ignored. Leave a value empty to use the default.

# Shown in the app and on audit evidence packages.
ORGANIZATION_NAME=

# Cloud accounts are connected in the app: Cloud Accounts > Connect.
# (Advanced: AWS_*, GCP_* and AZURE_* environment variables still work.)

# --- Scheduling and evidence ------------------------------------------------
# Scan every configured account every N hours while the app is open.
SCAN_INTERVAL_HOURS=
# Fresh evidence image for unchanged checks every N days (default 30).
SNAPSHOT_INTERVAL_DAYS=
# Independent timestamp authority ("off" to disable). Only a fingerprint is sent.
TIMESTAMP_AUTHORITY_URL=

# --- Sharing with teammates or your auditor -----------------------------------
# Set to true to let other computers on your network open ControlLayer at
# http://<this computer's address>:PORT (allow it through your firewall).
ALLOW_NETWORK_ACCESS=false
PORT=3210

# --- Optional features --------------------------------------------------------
ENABLE_AWS_REMEDIATION=false
ASSISTANT_API_KEY=
ASSISTANT_MODEL=
`;

/** Settings the desktop app manages itself; ignored if set in the file. */
const RESERVED = new Set(['DATABASE_URL', 'HOSTNAME', 'NODE_ENV', 'NEXT_RUNTIME']);

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (/^[A-Z_][A-Z0-9_]*$/i.test(key) && value !== '' && !RESERVED.has(key)) out[key] = value;
  }
  return out;
}

export interface Paths {
  data: string;
  settings: string;
  secrets: string;
  postgres: string;
  logs: string;
}

export function paths(userData: string): Paths {
  return {
    data: userData,
    settings: path.join(userData, 'settings.env'),
    secrets: path.join(userData, 'database.json'),
    postgres: path.join(userData, 'postgres'),
    logs: path.join(userData, 'logs'),
  };
}

export function loadSettings(p: Paths): Record<string, string> {
  mkdirSync(p.data, { recursive: true });
  if (!existsSync(p.settings)) writeFileSync(p.settings, SETTINGS_TEMPLATE, { mode: 0o600 });
  return parseEnv(readFileSync(p.settings, 'utf8'));
}

/**
 * Per-installation secrets, created on first start: the local database
 * password and the key that encrypts saved cloud keys.
 */
export function databaseSecret(p: Paths): { password: string; secretKey: string } {
  const existing = existsSync(p.secrets) ? JSON.parse(readFileSync(p.secrets, 'utf8')) : {};
  const secret = {
    password: existing.password ?? randomBytes(24).toString('base64url'),
    secretKey: existing.secretKey ?? randomBytes(32).toString('base64url'),
  };
  if (existing.password !== secret.password || existing.secretKey !== secret.secretKey) {
    mkdirSync(p.data, { recursive: true });
    writeFileSync(p.secrets, JSON.stringify(secret), { mode: 0o600 });
  }
  return secret;
}
