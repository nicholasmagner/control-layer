import { prisma } from '@/db/prisma';
import { decryptSecret, encryptSecret } from './secrets';

/**
 * Workspace settings. Admins edit them in Settings; they are stored in the
 * database and take effect immediately. Environment variables are used only
 * for settings that were never saved in the app (server installs, upgrades).
 */

export const DEFAULT_TSA_URL = 'https://freetsa.org/tsr';
export const SCAN_INTERVAL_CHOICES = [0, 6, 12, 24, 168] as const;

export interface Settings {
  organizationName: string;
  /** null = automatic scans off. */
  scanIntervalHours: number | null;
  snapshotIntervalDays: number;
  /** null = independent timestamps off. */
  timestampAuthorityUrl: string | null;
  remediationEnabled: boolean;
  assistantApiKey: string | null;
  assistantModel: string | null;
  /** Frameworks the company is working toward, shown in the framework picker. */
  frameworks: string[];
}

export type SettingKey = keyof Settings;
type Source = 'app' | 'environment' | 'default';

const SECRET_KEYS = new Set<SettingKey>(['assistantApiKey']);

const positive = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Pure: interprets a TIMESTAMP_AUTHORITY_URL-style value. */
export function parseTsaUrl(v: string | undefined | null): string | null {
  const s = v?.trim();
  if (s === 'off' || s === 'none' || s === 'false') return null;
  return s || DEFAULT_TSA_URL;
}

function fromEnvironment(): Partial<Record<SettingKey, unknown>> {
  const e = process.env;
  const out: Partial<Record<SettingKey, unknown>> = {};
  if (e.ORGANIZATION_NAME?.trim()) out.organizationName = e.ORGANIZATION_NAME.trim();
  if (e.SCAN_INTERVAL_HOURS) out.scanIntervalHours = positive(e.SCAN_INTERVAL_HOURS);
  if (e.SNAPSHOT_INTERVAL_DAYS) out.snapshotIntervalDays = positive(e.SNAPSHOT_INTERVAL_DAYS) ?? 30;
  if (e.TIMESTAMP_AUTHORITY_URL !== undefined && e.TIMESTAMP_AUTHORITY_URL !== '') out.timestampAuthorityUrl = parseTsaUrl(e.TIMESTAMP_AUTHORITY_URL);
  if (e.ENABLE_AWS_REMEDIATION) out.remediationEnabled = e.ENABLE_AWS_REMEDIATION === 'true';
  if (e.ASSISTANT_API_KEY) out.assistantApiKey = e.ASSISTANT_API_KEY;
  if (e.ASSISTANT_MODEL) out.assistantModel = e.ASSISTANT_MODEL;
  return out;
}

const DEFAULTS: Settings = {
  organizationName: 'Your organization',
  scanIntervalHours: null,
  snapshotIntervalDays: 30,
  timestampAuthorityUrl: DEFAULT_TSA_URL,
  remediationEnabled: false,
  assistantApiKey: null,
  assistantModel: null,
  frameworks: ['SOC2', 'ISO27001', 'HIPAA', 'GDPR', 'CMMC', 'PCI', 'ISO42001', 'NISTAIRMF'],
};

type Loaded = { settings: Settings; sources: Record<SettingKey, Source>; at: number };
const cache = globalThis as unknown as { __clSettings?: Loaded };

export async function loadSettings(): Promise<Loaded> {
  if (cache.__clSettings && Date.now() - cache.__clSettings.at < 5000) return cache.__clSettings;
  const rows = await prisma.appSetting.findMany();
  const saved: Partial<Record<SettingKey, unknown>> = {};
  for (const r of rows) {
    // Other features keep their own values in this table (Trust Center, device key).
    if (!(r.key in DEFAULTS)) continue;
    try {
      saved[r.key as SettingKey] = SECRET_KEYS.has(r.key as SettingKey) ? decryptSecret(r.value) : JSON.parse(r.value);
    } catch (err) {
      console.error(`[settings] could not read "${r.key}"`, err);
    }
  }
  const env = fromEnvironment();
  const settings = { ...DEFAULTS } as Record<SettingKey, unknown>;
  const sources = {} as Record<SettingKey, Source>;
  for (const k of Object.keys(DEFAULTS) as SettingKey[]) {
    if (k in saved) { settings[k] = saved[k]; sources[k] = 'app'; } else if (k in env) { settings[k] = env[k]; sources[k] = 'environment'; } else sources[k] = 'default';
  }
  const loaded = { settings: settings as unknown as Settings, sources, at: Date.now() };
  cache.__clSettings = loaded;
  return loaded;
}

export async function getSettings(): Promise<Settings> {
  return (await loadSettings()).settings;
}

/** Saves settings (null for a secret removes it). Secrets are encrypted. */
export async function saveSettings(values: Partial<Settings>, updatedBy: string) {
  for (const [k, v] of Object.entries(values) as [SettingKey, unknown][]) {
    if (SECRET_KEYS.has(k)) {
      if (v === null) await prisma.appSetting.deleteMany({ where: { key: k } });
      else await prisma.appSetting.upsert({ where: { key: k }, create: { key: k, value: encryptSecret(v), updatedBy }, update: { value: encryptSecret(v), updatedBy } });
    } else {
      const value = JSON.stringify(v);
      await prisma.appSetting.upsert({ where: { key: k }, create: { key: k, value, updatedBy }, update: { value, updatedBy } });
    }
  }
  cache.__clSettings = undefined;
}

/** What the Settings page shows. Never includes the API key itself. */
export async function settingsView() {
  const { settings: s, sources } = await loadSettings();
  return {
    organizationName: s.organizationName,
    scanIntervalHours: s.scanIntervalHours,
    snapshotIntervalDays: s.snapshotIntervalDays,
    timestampsEnabled: s.timestampAuthorityUrl !== null,
    timestampAuthorityUrl: s.timestampAuthorityUrl ?? DEFAULT_TSA_URL,
    remediationEnabled: s.remediationEnabled,
    frameworks: s.frameworks,
    assistant: {
      configured: !!s.assistantApiKey,
      keyHint: s.assistantApiKey ? `…${s.assistantApiKey.slice(-4)}` : null,
      model: s.assistantModel,
    },
    sources,
  };
}

export type SettingsView = Awaited<ReturnType<typeof settingsView>>;
