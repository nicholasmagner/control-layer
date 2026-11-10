import { CheckDef, DAY_MS, FormerPerson, INACTIVE_DAYS, matchFormer, Provider, ResourceResult } from './types';

/**
 * Checks for the company identity provider: Google Workspace and Microsoft 365
 * (Microsoft Entra ID). Both are normalized to the same inventory shape.
 */

export interface DirectoryUser {
  id: string;
  email: string;
  aliases?: string[];
  name: string;
  /** Super admin (Google) or Global Administrator (Microsoft). */
  isAdmin: boolean;
  /** Can sign in: not suspended (Google) / account enabled (Microsoft). */
  active: boolean;
  /** Guests and external users are excluded from MFA counts. */
  guest?: boolean;
  /** Enrolled in 2-Step Verification / registered for MFA. undefined = not readable. */
  mfaRegistered?: boolean;
  /** ISO time of last sign-in; null = never; undefined = not readable. */
  lastSignIn?: string | null;
  createdAt?: string;
}

export interface IdentityInventory {
  /** Primary domain (Google) or tenant name (Microsoft). */
  tenant: string;
  collectedAt: string;
  users?: DirectoryUser[];
  /**
   * Whether MFA is enforced for everyone: 2-Step Verification enforced for all
   * users (Google) or security defaults / a Conditional Access policy for all
   * users (Microsoft). undefined = not readable.
   */
  mfaEnforced?: { enforced: boolean; how: string };
  formerPeople?: FormerPerson[];
}

const NAMES: Record<string, string> = { gworkspace: 'Google Workspace', m365: 'Microsoft 365' };
const MAX_ADMINS = 4;

function identityChecks(provider: Extract<Provider, 'gworkspace' | 'm365'>): CheckDef<IdentityInventory>[] {
  const name = NAMES[provider];
  const google = provider === 'gworkspace';
  const adminWord = google ? 'super admin' : 'Global Administrator';
  const rid = (inv: IdentityInventory, u?: DirectoryUser) => `${provider}:${inv.tenant}${u ? `/${u.email}` : ''}`;
  const members = (inv: IdentityInventory) => (inv.users ?? []).filter(u => u.active && !u.guest);

  return [
    {
      id: `${provider}.mfa_enforced`,
      provider,
      title: `${name} requires multi-factor authentication`,
      description: google
        ? '2-Step Verification should be enforced for every user, not just available.'
        : 'Multi-factor authentication should be enforced for every user, through security defaults or a Conditional Access policy.',
      severity: 'High',
      remediation: google
        ? 'In the Google Admin console open Security > Authentication > 2-Step Verification, select the top organizational unit and set Enforcement to On.'
        : 'In the Microsoft Entra admin center, turn on security defaults (Identity > Overview > Properties), or create a Conditional Access policy that requires MFA for all users.',
      controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.4.2'] },
      evaluate: inv => {
        if (!inv.mfaEnforced) return null;
        return [{
          resourceId: rid(inv), resourceName: inv.tenant, status: inv.mfaEnforced.enforced ? 'pass' : 'fail',
          message: inv.mfaEnforced.enforced ? `MFA is enforced: ${inv.mfaEnforced.how}.` : `MFA is not enforced for everyone: ${inv.mfaEnforced.how}.`,
        }];
      },
    },
    {
      id: `${provider}.user_mfa`,
      provider,
      title: `${name} users have multi-factor authentication set up`,
      description: 'Every active user should have a second sign-in factor (authenticator app, security key or phone) registered.',
      severity: 'High',
      remediation: google
        ? 'Ask the listed users to turn on 2-Step Verification at myaccount.google.com/security, then enforce it for everyone.'
        : 'Ask the listed users to register at aka.ms/mysecurityinfo, then enforce MFA for everyone.',
      controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.4.2'] },
      evaluate: inv => {
        if (!inv.users) return null;
        const list = members(inv);
        if (list.some(u => u.mfaRegistered === undefined)) return null;
        return list.map<ResourceResult>(u => ({
          resourceId: rid(inv, u), resourceName: u.email, status: u.mfaRegistered ? 'pass' : 'fail',
          message: u.mfaRegistered ? `${u.email} has MFA set up.` : `${u.email} has no second factor set up.`,
          details: { admin: u.isAdmin },
        }));
      },
    },
    {
      id: `${provider}.inactive_users`,
      provider,
      title: `Unused ${name} accounts are disabled`,
      description: `Active accounts that have not signed in for ${INACTIVE_DAYS} days are often left over from people who left.`,
      severity: 'Medium',
      remediation: google
        ? 'Suspend or delete the listed users in the Google Admin console (Directory > Users), after checking they are no longer needed.'
        : 'Block sign-in for or delete the listed users in the Microsoft 365 admin center (Users > Active users), after checking they are no longer needed.',
      controls: { SOC2: ['CC6.2'], CMMC: ['AC.L1-3.1.1'], PCI: ['8.2.6'] },
      evaluate: inv => {
        if (!inv.users) return null;
        const list = members(inv);
        if (list.some(u => u.lastSignIn === undefined)) return null;
        const now = Date.parse(inv.collectedAt);
        return list.map<ResourceResult>(u => {
          const since = u.lastSignIn ?? u.createdAt;
          const days = since ? Math.floor((now - Date.parse(since)) / DAY_MS) : Infinity;
          const stale = days > INACTIVE_DAYS;
          return {
            resourceId: rid(inv, u), resourceName: u.email, status: stale ? 'fail' : 'pass',
            message: u.lastSignIn
              ? `${u.email} last signed in ${days} days ago.`
              : stale ? `${u.email} has never signed in (created ${Number.isFinite(days) ? `${days} days ago` : 'a while ago'}).` : `${u.email} was created recently and has not signed in yet.`,
          };
        });
      },
    },
    {
      id: `${provider}.admin_count`,
      provider,
      title: `Few ${name} ${adminWord}s`,
      description: `Full control of the company's accounts should be limited to a few people: no more than ${MAX_ADMINS} ${adminWord}s (ideally 2, so one locked-out account doesn't lock you out).`,
      severity: 'Medium',
      remediation: google
        ? 'In the Google Admin console open Account > Admin roles > Super Admin > Admins, and give everyday administrators a narrower role instead.'
        : 'In the Microsoft Entra admin center open Roles & admins > Global Administrator, and give everyday administrators a narrower role instead.',
      controls: { SOC2: ['CC6.3'], CMMC: ['AC.L1-3.1.2'], PCI: ['7.2.1'] },
      evaluate: inv => {
        if (!inv.users) return null;
        const admins = inv.users.filter(u => u.isAdmin && u.active);
        const ok = admins.length >= 1 && admins.length <= MAX_ADMINS;
        return [{
          resourceId: rid(inv), resourceName: inv.tenant, status: ok ? 'pass' : 'fail',
          message: `${admins.length} active ${adminWord}${admins.length === 1 ? '' : 's'}${admins.length ? `: ${admins.map(a => a.email).join(', ')}` : ''}.`
            + (admins.length === 1 ? ' Consider adding a second, so access is not lost if one account is locked out.' : ''),
          details: { admins: admins.map(a => a.email) },
        }];
      },
    },
    {
      id: `${provider}.former_employees`,
      provider,
      title: `People who left can no longer sign in to ${name}`,
      description: `Active ${name} accounts are compared with the people marked as having left in ControlLayer (by email).`,
      severity: 'High',
      remediation: google
        ? 'Suspend the listed users in the Google Admin console (Directory > Users > Suspend), transfer their data, and sign them out of all sessions.'
        : 'Block sign-in for the listed users in the Microsoft 365 admin center, revoke their sessions, and convert their mailbox if you need to keep it.',
      controls: { SOC2: ['CC6.2', 'CC6.3'], CMMC: ['AC.L1-3.1.1'], PCI: ['8.2.6'] },
      evaluate: inv => {
        if (!inv.users || !inv.formerPeople) return null;
        return inv.users.filter(u => u.active).map<ResourceResult>(u => {
          const left = matchFormer(inv.formerPeople!, { emails: [u.email, ...(u.aliases ?? [])] });
          return {
            resourceId: rid(inv, u), resourceName: u.email, status: left ? 'fail' : 'pass',
            message: left ? `${u.email} can still sign in, but ${left.name} left on ${left.endDate.slice(0, 10)}.` : `${u.email} is not linked to anyone who left.`,
          };
        });
      },
    },
  ];
}

export const GWORKSPACE_CHECKS = identityChecks('gworkspace');
export const M365_CHECKS = identityChecks('m365');
