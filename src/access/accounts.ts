import type { AwsInventory } from '@/checks/aws';
import type { DevicesInventory } from '@/checks/devices';
import type { GcpInventory } from '@/checks/gcp';
import type { GithubInventory } from '@/checks/github';
import type { IdentityInventory } from '@/checks/identity';
import type { Provider } from '@/checks/types';

/**
 * The user accounts in each system, taken from the same scan data the checks
 * use. Access reviews are built from these, and later scans confirm that
 * accounts marked for removal are gone.
 */
export interface AccountRow {
  accountId: string;
  name: string;
  email: string | null;
  system: string;
  isAdmin: boolean;
  active: boolean;
  lastActivity: string | null;
  detail: string | null;
}

const latest = (...d: (string | null | undefined)[]) => d.filter((x): x is string => !!x).sort().at(-1) ?? null;
const ADMIN_ROLES = new Set(['roles/owner', 'roles/editor', 'roles/iam.securityAdmin', 'roles/resourcemanager.projectIamAdmin']);

export const SYSTEM_NAMES: Record<string, string> = {
  aws: 'AWS IAM', gcp: 'Google Cloud IAM', gworkspace: 'Google Workspace', m365: 'Microsoft 365', ad: 'Active Directory', github: 'GitHub', devices: 'Server local accounts',
};

/** null = this provider has no account list (or it could not be read). */
export function extractAccounts(provider: Provider, inventory: unknown): AccountRow[] | null {
  switch (provider) {
    case 'aws': {
      const inv = inventory as AwsInventory;
      if (!inv.credentialReport) return null;
      return inv.credentialReport.map(u => ({
        accountId: u.arn, name: u.isRoot ? 'root account' : u.user, email: null, system: `${SYSTEM_NAMES.aws}${inv.accountId ? ` (${inv.accountId})` : ''}`,
        isAdmin: u.isRoot, active: u.passwordEnabled || u.accessKeys.some(k => k.active),
        lastActivity: latest(u.passwordLastUsed, ...u.accessKeys.map(k => k.lastUsed)),
        detail: [u.passwordEnabled ? 'console password' : null, u.accessKeys.some(k => k.active) ? 'access key' : null, u.mfaActive ? 'MFA' : 'no MFA'].filter(Boolean).join(', '),
      }));
    }
    case 'gcp': {
      const inv = inventory as GcpInventory;
      if (!inv.iamBindings) return null;
      const roles = new Map<string, string[]>();
      for (const b of inv.iamBindings) for (const m of b.members) {
        if (!/^(user|serviceAccount):/.test(m)) continue;
        roles.set(m, [...(roles.get(m) ?? []), b.role]);
      }
      return [...roles].map(([m, r]) => {
        const id = m.split(':')[1];
        return {
          accountId: m, name: id, email: m.startsWith('user:') ? id.toLowerCase() : null, system: `${SYSTEM_NAMES.gcp} (${inv.projectId})`,
          isAdmin: r.some(x => ADMIN_ROLES.has(x)), active: true, lastActivity: null, detail: r.map(x => x.replace(/^roles\//, '')).join(', '),
        };
      });
    }
    case 'gworkspace':
    case 'm365':
    case 'ad': {
      const inv = inventory as IdentityInventory;
      if (!inv.users) return null;
      return inv.users.map(u => ({
        accountId: u.id, name: u.name, email: u.email, system: SYSTEM_NAMES[provider], isAdmin: u.isAdmin, active: u.active,
        lastActivity: u.lastSignIn ?? null, detail: [u.guest ? 'guest' : null, u.mfaRegistered === false ? 'no MFA' : null].filter(Boolean).join(', ') || null,
      }));
    }
    case 'github': {
      const inv = inventory as GithubInventory;
      if (!inv.members) return null;
      return inv.members.map(m => ({
        accountId: m.login, name: m.login, email: null, system: `${SYSTEM_NAMES.github} (${inv.org})`, isAdmin: m.role === 'admin', active: true,
        lastActivity: null, detail: [m.role === 'admin' ? 'owner' : 'member', m.twoFactorEnabled === false ? 'no 2FA' : null].filter(Boolean).join(', '),
      }));
    }
    case 'devices': {
      const inv = inventory as DevicesInventory;
      if (!inv.devices) return null;
      return inv.devices.filter(d => d.localAccounts).flatMap(d => d.localAccounts!.map(a => ({
        accountId: `${d.id}/${a.name}`, name: a.name, email: null, system: `${d.hostname} (local)`, isAdmin: a.admin, active: a.enabled,
        lastActivity: a.lastLogin ?? null, detail: d.osVersion,
      })));
    }
    default:
      return null;
  }
}

export interface PersonRef { name: string; email: string; githubUsername: string | null; endDate: Date | null }

/** Flags for a reviewer: who the account belongs to, and what looks wrong. */
export function accountFlags(a: { provider: string; name: string; email: string | null; isAdmin: boolean; lastActivity: Date | null; active: boolean }, people: PersonRef[], now: Date) {
  const flags: string[] = [];
  const email = a.email?.toLowerCase() ?? null;
  const login = a.provider === 'github' ? a.name.toLowerCase() : null;
  const person = people.find(p => (email && p.email.toLowerCase() === email) || (login && p.githubUsername?.toLowerCase() === login));
  const human = ['gworkspace', 'm365', 'ad', 'github', 'gcp'].includes(a.provider) && (a.provider !== 'gcp' || !!email);
  if (person?.endDate && person.endDate <= now) flags.push('left');
  else if (human && people.length && !person) flags.push('unknown');
  if (a.lastActivity === null && ['gworkspace', 'm365', 'ad', 'aws', 'devices'].includes(a.provider)) flags.push('never_used');
  else if (a.lastActivity && now.getTime() - a.lastActivity.getTime() > 90 * 86_400_000) flags.push('inactive');
  if (a.isAdmin) flags.push('admin');
  return { flags, person: person ?? null };
}

export const FLAG_LABEL: Record<string, string> = {
  left: 'Person left', unknown: 'Not in People', inactive: 'Unused 90+ days', never_used: 'Never used', admin: 'Admin',
};
