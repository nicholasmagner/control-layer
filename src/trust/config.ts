import { HttpError } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { FRAMEWORK_IDS } from '@/frameworks';
import { EMAIL_RE } from '@/lib/http';

/** Trust Center settings, edited by admins under Trust Center. */
export interface TrustConfig {
  enabled: boolean;
  headline: string;
  description: string;
  contactEmail: string;
  /** Frameworks to show, with a status line such as "SOC 2 Type II report available". */
  frameworks: { id: string; status: string }[];
  /** Show security practices verified by the latest scans. */
  showPractices: boolean;
  /** List published policy titles (the documents themselves stay private). */
  showPolicies: boolean;
  /** Days an approved access link stays valid. */
  accessDays: number;
  ndaText: string;
}

export const DEFAULT_NDA = 'I agree to keep the documents shared with me confidential, to use them only to evaluate the security of this company as a current or potential customer or partner, and not to share them with anyone outside my organization.';

export const DEFAULT_TRUST: TrustConfig = {
  enabled: false,
  headline: 'Security and compliance',
  description: 'We take the security of your data seriously. This page describes how we protect it and the controls we have in place. Request access to see our audit reports and security documents.',
  contactEmail: '',
  frameworks: [],
  showPractices: true,
  showPolicies: true,
  accessDays: 30,
  ndaText: DEFAULT_NDA,
};

const KEY = 'trustCenter';

export async function loadTrustConfig(): Promise<TrustConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row) return { ...DEFAULT_TRUST };
  try {
    return { ...DEFAULT_TRUST, ...(JSON.parse(row.value) as Partial<TrustConfig>) };
  } catch {
    return { ...DEFAULT_TRUST };
  }
}

const text = (v: unknown, field: string, max: number) => {
  if (typeof v !== 'string') throw new HttpError(400, `"${field}" must be text.`);
  if (v.length > max) throw new HttpError(400, `"${field}" is too long (max ${max} characters).`);
  return v.trim();
};

/** Validates a partial update and returns the merged config. Pure apart from the input. */
export function mergeTrustConfig(current: TrustConfig, body: Record<string, unknown>): TrustConfig {
  const next = { ...current };
  if ('enabled' in body) next.enabled = body.enabled === true;
  if ('headline' in body) next.headline = text(body.headline, 'headline', 120);
  if ('description' in body) next.description = text(body.description, 'description', 2000);
  if ('contactEmail' in body) {
    const v = text(body.contactEmail, 'contact email', 254).toLowerCase();
    if (v && !EMAIL_RE.test(v)) throw new HttpError(400, 'Enter a valid contact email.');
    next.contactEmail = v;
  }
  if ('showPractices' in body) next.showPractices = body.showPractices === true;
  if ('showPolicies' in body) next.showPolicies = body.showPolicies === true;
  if ('accessDays' in body) {
    const n = Number(body.accessDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new HttpError(400, 'Access links can last 1 to 365 days.');
    next.accessDays = n;
  }
  if ('ndaText' in body) next.ndaText = text(body.ndaText, 'NDA text', 5000) || DEFAULT_NDA;
  if ('frameworks' in body) {
    if (!Array.isArray(body.frameworks) || body.frameworks.length > 10) throw new HttpError(400, 'Invalid frameworks.');
    next.frameworks = body.frameworks.map(f => {
      const item = f as { id?: unknown; status?: unknown };
      if (typeof item.id !== 'string' || !FRAMEWORK_IDS.includes(item.id as never)) throw new HttpError(400, 'Unknown framework.');
      return { id: item.id, status: text(item.status ?? '', 'framework status', 120) };
    });
  }
  return next;
}

export async function saveTrustConfig(config: TrustConfig, updatedBy: string) {
  const value = JSON.stringify(config);
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value, updatedBy }, update: { value, updatedBy } });
}
