/**
 * The report the ControlLayer agent script sends from a server or laptop.
 * Every setting is optional: null / missing means the script could not read
 * it, and the related check reports "not evaluated" instead of passing.
 * Reports come from outside, so everything is validated and size-limited.
 */

export const AGENT_VERSION = '1.0.0';

export interface LocalAccount {
  name: string;
  admin: boolean;
  enabled: boolean;
  /** ISO time of the last sign-in; null = never; undefined = unknown. */
  lastLogin?: string | null;
}

export interface DeviceReport {
  machineId: string;
  hostname: string;
  os: 'linux' | 'windows' | 'macos';
  osVersion: string;
  role: 'server' | 'workstation';
  owner?: string;
  agentVersion: string;
  diskEncrypted?: boolean | null;
  firewallEnabled?: boolean | null;
  autoUpdates?: boolean | null;
  /** Days since operating system updates were last installed. */
  daysSinceUpdate?: number | null;
  malwareProtection?: boolean | null;
  /** Minutes until the screen locks; null = never or unknown. */
  screenLockMinutes?: number | null;
  sshRootLogin?: boolean | null;
  sshPasswordAuth?: boolean | null;
  rdpEnabled?: boolean | null;
  rdpNla?: boolean | null;
  auditLogging?: boolean | null;
  passwordMinLength?: number | null;
  lockoutThreshold?: number | null;
  timeSync?: boolean | null;
  localAccounts?: LocalAccount[] | null;
}

const ROLES = new Set(['server', 'workstation']);
const OSES = new Set(['linux', 'windows', 'macos']);

const clean = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');
const bool = (v: unknown) => (typeof v === 'boolean' ? v : null);
const num = (v: unknown, max: number) => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.min(Math.round(n), max) : null;
};
const isoOrNull = (v: unknown) => {
  if (v === null) return null;
  if (typeof v !== 'string' || !v) return undefined;
  const t = Date.parse(v);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
};

/** Validates an agent report. Returns an error message for unusable input. */
export function parseDeviceReport(body: unknown): DeviceReport | string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return 'Expected a JSON object.';
  const b = body as Record<string, unknown>;
  const machineId = clean(b.machineId, 200);
  const hostname = clean(b.hostname, 255);
  const os = clean(b.os, 20).toLowerCase();
  if (machineId.length < 8) return 'machineId is missing.';
  if (!hostname) return 'hostname is missing.';
  if (!OSES.has(os)) return 'os must be linux, windows or macos.';
  const roleIn = clean(b.role, 20).toLowerCase();
  const role = (ROLES.has(roleIn) ? roleIn : os === 'linux' ? 'server' : 'workstation') as DeviceReport['role'];
  const owner = clean(b.owner, 254).toLowerCase();

  let localAccounts: LocalAccount[] | null = null;
  if (Array.isArray(b.localAccounts)) {
    localAccounts = b.localAccounts.slice(0, 500).flatMap(a => {
      if (!a || typeof a !== 'object') return [];
      const x = a as Record<string, unknown>;
      const name = clean(x.name, 100);
      if (!name) return [];
      const acct: LocalAccount = { name, admin: x.admin === true, enabled: x.enabled !== false };
      const last = isoOrNull(x.lastLogin);
      if (last !== undefined) acct.lastLogin = last;
      return [acct];
    });
  }

  return {
    machineId, hostname, os: os as DeviceReport['os'], osVersion: clean(b.osVersion, 200) || os, role,
    owner: owner && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner) ? owner : undefined,
    agentVersion: clean(b.agentVersion, 20) || 'unknown',
    diskEncrypted: bool(b.diskEncrypted),
    firewallEnabled: bool(b.firewallEnabled),
    autoUpdates: bool(b.autoUpdates),
    daysSinceUpdate: num(b.daysSinceUpdate, 100_000),
    malwareProtection: bool(b.malwareProtection),
    // Absent = could not be read (undefined); null = no lock is set.
    screenLockMinutes: 'screenLockMinutes' in b ? num(b.screenLockMinutes, 100_000) : undefined,
    sshRootLogin: bool(b.sshRootLogin),
    sshPasswordAuth: bool(b.sshPasswordAuth),
    rdpEnabled: bool(b.rdpEnabled),
    rdpNla: bool(b.rdpNla),
    auditLogging: bool(b.auditLogging),
    passwordMinLength: num(b.passwordMinLength, 1000),
    lockoutThreshold: num(b.lockoutThreshold, 100_000),
    timeSync: bool(b.timeSync),
    localAccounts,
  };
}
