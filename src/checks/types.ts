import type { FrameworkId } from '@/frameworks';

export type Provider = 'aws' | 'gcp' | 'azure' | 'github' | 'gworkspace' | 'm365' | 'ad' | 'devices';

/** People marked as having left, from the People list, for offboarding checks. */
export interface FormerPerson {
  name: string;
  email: string;
  githubUsername?: string | null;
  endDate: string;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Finds the former person an account belongs to, by email (or alias) or GitHub username. */
export function matchFormer(former: FormerPerson[], account: { emails?: string[]; login?: string }): FormerPerson | undefined {
  const emails = new Set((account.emails ?? []).map(norm));
  const login = account.login ? norm(account.login) : null;
  return former.find(p => emails.has(norm(p.email)) || (!!login && !!p.githubUsername && norm(p.githubUsername) === login));
}
export type Severity = 'High' | 'Medium' | 'Low';

export interface ResourceResult {
  resourceId: string;
  resourceName?: string;
  status: 'pass' | 'fail';
  message: string;
  details?: Record<string, unknown>;
}

export interface CheckDef<Inventory> {
  id: string;
  provider: Provider;
  title: string;
  /** What the check verifies, written for the person reading the finding. */
  description: string;
  severity: Severity;
  remediation: string;
  /** Controls this check provides evidence for, per framework. */
  controls: Partial<Record<FrameworkId, string[]>>;
  /**
   * Returns one result per resource, or null when the inventory section this
   * check needs could not be collected (e.g. missing permission). Null means
   * "not evaluated" - it must never be treated as passing.
   */
  evaluate: (inventory: Inventory) => ResourceResult[] | null;
}

export const ADMIN_PORTS = [22, 3389] as const;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const MAX_CREDENTIAL_AGE_DAYS = 90;
export const INACTIVE_DAYS = 90;
