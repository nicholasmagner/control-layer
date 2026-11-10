import { describe, expect, it } from 'vitest';
import { sampleGithub, sampleGworkspace, sampleM365 } from '@/connectors/sample';
import { getControlDef } from '@/frameworks';
import { GITHUB_CHECKS } from './github';
import { GWORKSPACE_CHECKS, M365_CHECKS } from './identity';
import { ALL_CHECKS, isProvider } from './index';
import type { CheckDef } from './types';

const now = new Date('2026-06-01T00:00:00Z');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (checks: CheckDef<any>[], id: string, inv: unknown) => checks.find(c => c.id === id)!.evaluate(inv);
const failing = (r: ReturnType<typeof run>) => r?.filter(x => x.status === 'fail').map(x => x.resourceName);

describe('all checks', () => {
  it('have unique ids and map to real controls', () => {
    expect(new Set(ALL_CHECKS.map(c => c.id)).size).toBe(ALL_CHECKS.length);
    for (const c of ALL_CHECKS) {
      for (const [fw, ids] of Object.entries(c.controls)) {
        for (const id of ids ?? []) expect(getControlDef(fw, id), `${c.id} -> ${fw} ${id}`).toBeDefined();
      }
    }
    expect(isProvider('github')).toBe(true);
    expect(isProvider('nope')).toBe(false);
  });
});

describe('GitHub checks', () => {
  const inv = sampleGithub(now);
  it('flag the missing org 2FA requirement and members without 2FA', () => {
    expect(failing(run(GITHUB_CHECKS, 'github.org_2fa_required', inv))).toEqual(['acme-example']);
    expect(failing(run(GITHUB_CHECKS, 'github.member_2fa', inv))).toEqual(['priya-n']);
  });
  it('flag repositories without required review, secret scanning or Dependabot', () => {
    expect(failing(run(GITHUB_CHECKS, 'github.branch_protection', inv))).toEqual(['infrastructure']);
    expect(failing(run(GITHUB_CHECKS, 'github.secret_scanning', inv))).toEqual(['infrastructure']);
    expect(failing(run(GITHUB_CHECKS, 'github.dependabot_alerts', inv))).toEqual(['docs']);
  });
  it('find people who left but are still in the organization', () => {
    expect(failing(run(GITHUB_CHECKS, 'github.former_members', inv))).toEqual(['samr-dev']);
  });
  it('report "not evaluated" when data could not be read', () => {
    expect(run(GITHUB_CHECKS, 'github.org_2fa_required', { org: 'x', collectedAt: now.toISOString() })).toBeNull();
    expect(run(GITHUB_CHECKS, 'github.member_2fa', { org: 'x', collectedAt: now.toISOString(), members: [{ login: 'a', role: 'member' }] })).toBeNull();
    expect(run(GITHUB_CHECKS, 'github.secret_scanning', { org: 'x', collectedAt: now.toISOString(), repos: [{ name: 'r', private: true, defaultBranch: 'main' }] })).toBeNull();
  });
});

describe('Google Workspace checks', () => {
  const inv = sampleGworkspace(now);
  it('evaluate MFA, inactive users, admins and leavers', () => {
    expect(failing(run(GWORKSPACE_CHECKS, 'gworkspace.mfa_enforced', inv))).toEqual(['acme.example']);
    expect(failing(run(GWORKSPACE_CHECKS, 'gworkspace.user_mfa', inv))).toEqual(['dev.chen@acme.example', 'events@acme.example']);
    expect(failing(run(GWORKSPACE_CHECKS, 'gworkspace.inactive_users', inv))).toEqual(['events@acme.example']);
    expect(failing(run(GWORKSPACE_CHECKS, 'gworkspace.admin_count', inv))).toEqual([]);
    expect(failing(run(GWORKSPACE_CHECKS, 'gworkspace.former_employees', inv))).toEqual(['sam.rivera@acme.example']);
  });
  it('fails with too many admins', () => {
    const users = Array.from({ length: 5 }, (_, i) => ({ id: `${i}`, email: `a${i}@x.com`, name: 'A', isAdmin: true, active: true }));
    expect(failing(run(GWORKSPACE_CHECKS, 'gworkspace.admin_count', { tenant: 'x.com', collectedAt: now.toISOString(), users }))).toEqual(['x.com']);
  });
});

describe('Microsoft 365 checks', () => {
  const inv = sampleM365(now);
  it('skip guests for MFA and pass with security defaults', () => {
    expect(failing(run(M365_CHECKS, 'm365.mfa_enforced', inv))).toEqual([]);
    expect(run(M365_CHECKS, 'm365.user_mfa', inv)?.map(r => r.resourceName)).not.toContain('partner_contoso.com#EXT#@acme.onmicrosoft.com');
  });
  it('treats unreadable sign-in data as not evaluated', () => {
    const users = [{ id: '1', email: 'a@x.com', name: 'A', isAdmin: false, active: true, lastSignIn: undefined }];
    expect(run(M365_CHECKS, 'm365.inactive_users', { tenant: 'x', collectedAt: now.toISOString(), users })).toBeNull();
  });
  it('matches leavers by alias', () => {
    const users = [{ id: '1', email: 'sr@x.onmicrosoft.com', aliases: ['sam.rivera@acme.example'], name: 'Sam', isAdmin: false, active: true }];
    expect(failing(run(M365_CHECKS, 'm365.former_employees', { ...inv, users }))).toEqual(['sr@x.onmicrosoft.com']);
  });
});
