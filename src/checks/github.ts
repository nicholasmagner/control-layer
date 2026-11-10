import { CheckDef, DAY_MS, FormerPerson, matchFormer, ResourceResult } from './types';

export interface GithubRepo {
  name: string;
  private: boolean;
  defaultBranch: string;
  /**
   * Pull request reviews required on the default branch, from branch
   * protection or rulesets. 0 = no review required; undefined = not readable.
   */
  requiredReviews?: number;
  /** undefined = could not be read (needs admin access to the repository). */
  secretScanning?: boolean;
  dependabotAlerts?: boolean;
}

export interface GithubInventory {
  org: string;
  collectedAt: string;
  /** undefined when the organization settings could not be read. */
  twoFactorRequired?: boolean;
  /** 'read' | 'write' | 'admin' | 'none' */
  defaultRepoPermission?: string;
  members?: { login: string; role: 'admin' | 'member'; twoFactorEnabled?: boolean }[];
  /** Repositories that are not archived. */
  repos?: GithubRepo[];
  formerPeople?: FormerPerson[];
}

const org = (inv: GithubInventory) => ({ resourceId: `github:${inv.org}`, resourceName: inv.org });

export const GITHUB_CHECKS: CheckDef<GithubInventory>[] = [
  {
    id: 'github.org_2fa_required',
    provider: 'github',
    title: 'Two-factor authentication required for the GitHub organization',
    description: 'The organization should require every member and outside collaborator to use two-factor authentication.',
    severity: 'High',
    remediation: 'In GitHub, open the organization > Settings > Authentication security and check "Require two-factor authentication for everyone".',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.4.2'] },
    evaluate: inv => {
      if (inv.twoFactorRequired === undefined) return null;
      return [{
        ...org(inv), status: inv.twoFactorRequired ? 'pass' : 'fail',
        message: inv.twoFactorRequired ? `${inv.org} requires two-factor authentication.` : `${inv.org} does not require two-factor authentication.`,
      }];
    },
  },
  {
    id: 'github.member_2fa',
    provider: 'github',
    title: 'GitHub members use two-factor authentication',
    description: 'Every member of the organization should have two-factor authentication turned on.',
    severity: 'High',
    remediation: 'Ask the listed members to turn on two-factor authentication (GitHub > Settings > Password and authentication), or require it for the organization.',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.4.2'] },
    evaluate: inv => {
      if (!inv.members || inv.members.some(m => m.twoFactorEnabled === undefined)) return null;
      return inv.members.map<ResourceResult>(m => ({
        resourceId: `github:${inv.org}/${m.login}`, resourceName: m.login,
        status: m.twoFactorEnabled ? 'pass' : 'fail',
        message: m.twoFactorEnabled ? `${m.login} uses two-factor authentication.` : `${m.login} does not use two-factor authentication.`,
      }));
    },
  },
  {
    id: 'github.default_permission',
    provider: 'github',
    title: 'GitHub base permission is read-only or none',
    description: 'Members should get write or admin access to repositories only where they need it, not by default.',
    severity: 'Medium',
    remediation: 'Open the organization > Settings > Member privileges and set "Base permissions" to Read or No permission. Grant write access per team or repository.',
    controls: { SOC2: ['CC6.3'], CMMC: ['AC.L1-3.1.2'], PCI: ['7.2.1'] },
    evaluate: inv => {
      if (!inv.defaultRepoPermission) return null;
      const ok = inv.defaultRepoPermission === 'read' || inv.defaultRepoPermission === 'none';
      return [{ ...org(inv), status: ok ? 'pass' : 'fail', message: `Base permission for members is "${inv.defaultRepoPermission}".` }];
    },
  },
  {
    id: 'github.branch_protection',
    provider: 'github',
    title: 'Code changes require a reviewed pull request',
    description: 'The default branch of each repository should only change through a pull request approved by someone other than the author.',
    severity: 'High',
    remediation: 'Open the repository > Settings > Rules > Rulesets (or Branches) and add a rule for the default branch that requires a pull request with at least 1 approval.',
    controls: { SOC2: ['CC8.1'], PCI: ['6.5.1'] },
    evaluate: inv => {
      if (!inv.repos) return null;
      const known = inv.repos.filter(r => r.requiredReviews !== undefined);
      if (inv.repos.length && !known.length) return null;
      return known.map<ResourceResult>(r => ({
        resourceId: `github:${inv.org}/${r.name}`, resourceName: r.name,
        status: (r.requiredReviews ?? 0) >= 1 ? 'pass' : 'fail',
        message: (r.requiredReviews ?? 0) >= 1
          ? `${r.name}: ${r.defaultBranch} requires ${r.requiredReviews} approving review(s).`
          : `${r.name}: changes to ${r.defaultBranch} do not require an approved pull request.`,
        details: { branch: r.defaultBranch, private: r.private },
      }));
    },
  },
  {
    id: 'github.secret_scanning',
    provider: 'github',
    title: 'Secret scanning is on',
    description: 'GitHub secret scanning finds passwords and keys committed to code, so they can be revoked.',
    severity: 'Medium',
    remediation: 'Open the repository (or organization) > Settings > Code security and turn on Secret scanning and Push protection. It is free for public repositories; private repositories need GitHub Secret Protection.',
    controls: { SOC2: ['CC6.1', 'CC7.1'], PCI: ['6.3.3'] },
    evaluate: inv => {
      if (!inv.repos) return null;
      const known = inv.repos.filter(r => r.secretScanning !== undefined);
      if (inv.repos.length && !known.length) return null;
      return known.map<ResourceResult>(r => ({
        resourceId: `github:${inv.org}/${r.name}`, resourceName: r.name,
        status: r.secretScanning ? 'pass' : 'fail',
        message: r.secretScanning ? `${r.name}: secret scanning is on.` : `${r.name}: secret scanning is off.`,
      }));
    },
  },
  {
    id: 'github.dependabot_alerts',
    provider: 'github',
    title: 'Vulnerable dependency alerts are on',
    description: 'Dependabot alerts warn when a repository uses a library with a known vulnerability.',
    severity: 'Medium',
    remediation: 'Open the repository (or organization) > Settings > Code security and turn on Dependabot alerts.',
    controls: { SOC2: ['CC7.1'], CMMC: ['SI.L1-3.14.1'], PCI: ['6.3.3'] },
    evaluate: inv => {
      if (!inv.repos) return null;
      const known = inv.repos.filter(r => r.dependabotAlerts !== undefined);
      if (inv.repos.length && !known.length) return null;
      return known.map<ResourceResult>(r => ({
        resourceId: `github:${inv.org}/${r.name}`, resourceName: r.name,
        status: r.dependabotAlerts ? 'pass' : 'fail',
        message: r.dependabotAlerts ? `${r.name}: Dependabot alerts are on.` : `${r.name}: Dependabot alerts are off.`,
      }));
    },
  },
  {
    id: 'github.former_members',
    provider: 'github',
    title: 'People who left no longer have GitHub access',
    description: 'Members of the GitHub organization are compared with the people marked as having left in ControlLayer (by GitHub username).',
    severity: 'High',
    remediation: 'Remove the listed accounts from the organization (Organization > People > Remove from organization), then rotate any secrets they could see.',
    controls: { SOC2: ['CC6.2', 'CC6.3'], CMMC: ['AC.L1-3.1.1'], PCI: ['8.2.6'] },
    evaluate: inv => {
      if (!inv.members || !inv.formerPeople) return null;
      return inv.members.map<ResourceResult>(m => {
        const left = matchFormer(inv.formerPeople!, { login: m.login });
        return {
          resourceId: `github:${inv.org}/${m.login}`, resourceName: m.login,
          status: left ? 'fail' : 'pass',
          message: left
            ? `${m.login} belongs to ${left.name}, who left on ${left.endDate.slice(0, 10)} (${Math.round((Date.parse(inv.collectedAt) - Date.parse(left.endDate)) / DAY_MS)} days ago).`
            : `${m.login} is not linked to anyone who left.`,
        };
      });
    },
  },
];
