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

type IdentityProvider = Extract<Provider, 'gworkspace' | 'm365' | 'ad'>;

const TEXT: Record<IdentityProvider, { name: string; adminWord: string; inactiveFix: string; adminFix: string; leaverFix: string }> = {
  gworkspace: {
    name: 'Google Workspace', adminWord: 'super admin',
    inactiveFix: 'Suspend or delete the listed users in the Google Admin console (Directory > Users), after checking they are no longer needed.',
    adminFix: 'In the Google Admin console open Account > Admin roles > Super Admin > Admins, and give everyday administrators a narrower role instead.',
    leaverFix: 'Suspend the listed users in the Google Admin console (Directory > Users > Suspend), transfer their data, and sign them out of all sessions.',
  },
  m365: {
    name: 'Microsoft 365', adminWord: 'Global Administrator',
    inactiveFix: 'Block sign-in for or delete the listed users in the Microsoft 365 admin center (Users > Active users), after checking they are no longer needed.',
    adminFix: 'In the Microsoft Entra admin center open Roles & admins > Global Administrator, and give everyday administrators a narrower role instead.',
    leaverFix: 'Block sign-in for the listed users in the Microsoft 365 admin center, revoke their sessions, and convert their mailbox if you need to keep it.',
  },
  ad: {
    name: 'Active Directory', adminWord: 'Domain Admin',
    inactiveFix: 'Disable the listed accounts in Active Directory Users and Computers (or Disable-ADAccount), after checking they are not service accounts in use.',
    adminFix: 'Remove everyday accounts from Domain Admins and Enterprise Admins; use separate admin accounts and delegated permissions instead.',
    leaverFix: 'Disable the listed accounts in Active Directory (Disable-ADAccount), reset their passwords, and remove them from groups.',
  },
};
const MAX_ADMINS = 4;

function identityChecks(provider: IdentityProvider): CheckDef<IdentityInventory>[] {
  const t = TEXT[provider];
  const name = t.name;
  const google = provider === 'gworkspace';
  const adminWord = t.adminWord;
  const rid = (inv: IdentityInventory, u?: DirectoryUser) => `${provider}:${inv.tenant}${u ? `/${u.email}` : ''}`;
  const members = (inv: IdentityInventory) => (inv.users ?? []).filter(u => u.active && !u.guest);

  const all: CheckDef<IdentityInventory>[] = [
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
      remediation: t.inactiveFix,
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
      remediation: t.adminFix,
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
      remediation: t.leaverFix,
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
  // Active Directory has no built-in MFA; that is covered by the identity provider in front of it.
  return provider === 'ad' ? all.filter(c => !c.id.endsWith('mfa_enforced') && !c.id.endsWith('user_mfa')) : all;
}

export const GWORKSPACE_CHECKS = identityChecks('gworkspace');
export const M365_CHECKS = identityChecks('m365');

/** Active Directory: the shared identity checks plus domain password settings. */
export interface AdInventory extends IdentityInventory {
  passwordPolicy?: { minLength: number; complexity: boolean; lockoutThreshold: number; maxAgeDays: number | null };
  /** Enabled user accounts with "password never expires" or "password not required". */
  flags?: { email: string; passwordNeverExpires: boolean; passwordNotRequired: boolean }[];
}

export const AD_CHECKS: CheckDef<AdInventory>[] = [
  ...(identityChecks('ad') as CheckDef<AdInventory>[]),
  {
    id: 'ad.password_policy',
    provider: 'ad',
    title: 'Active Directory password rules are strong',
    description: 'The domain password policy should require at least 12 characters with complexity, and lock accounts after at most 10 failed attempts.',
    severity: 'High',
    remediation: 'Edit the Default Domain Policy (Group Policy Management > Computer Configuration > Policies > Windows Settings > Security Settings > Account Policies): minimum password length 12+, complexity enabled, account lockout threshold 10 or fewer.',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.3.6'] },
    evaluate: inv => {
      const p = inv.passwordPolicy;
      if (!p) return null;
      const problems = [
        p.minLength < 12 ? `minimum length is ${p.minLength}` : null,
        !p.complexity ? 'complexity is off' : null,
        p.lockoutThreshold === 0 ? 'accounts never lock after failed attempts' : p.lockoutThreshold > 10 ? `accounts lock after ${p.lockoutThreshold} failed attempts` : null,
      ].filter(Boolean);
      return [{
        resourceId: `ad:${inv.tenant}`, resourceName: inv.tenant, status: problems.length ? 'fail' : 'pass',
        message: problems.length ? `Domain password policy: ${problems.join('; ')}.` : `Domain password policy: ${p.minLength}+ characters, complexity on, lockout after ${p.lockoutThreshold} attempts.`,
      }];
    },
  },
  {
    id: 'ad.password_flags',
    provider: 'ad',
    title: 'No accounts skip password rules',
    description: 'Enabled user accounts should not be set to "password not required", and should not have passwords that never expire unless they are documented service accounts.',
    severity: 'Medium',
    remediation: 'In Active Directory Users and Computers, open each listed account > Account and clear "Password never expires"; clear "password not required" with Set-ADAccountControl -PasswordNotRequired $false. Use group managed service accounts for services.',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.3.6'] },
    evaluate: inv => {
      if (!inv.flags) return null;
      return inv.flags.map<ResourceResult>(f => {
        const problems = [f.passwordNotRequired ? 'password not required' : null, f.passwordNeverExpires ? 'password never expires' : null].filter(Boolean);
        return {
          resourceId: `ad:${inv.tenant}/${f.email}`, resourceName: f.email, status: problems.length ? 'fail' : 'pass',
          message: problems.length ? `${f.email}: ${problems.join(', ')}.` : `${f.email} follows the password rules.`,
        };
      });
    },
  },
];
