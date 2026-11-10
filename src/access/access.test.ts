import { describe, expect, it } from 'vitest';
import { sampleAws, sampleDevices, sampleGcp, sampleGithub, sampleGworkspace } from '@/connectors/sample';
import { accountFlags, extractAccounts } from './accounts';

const now = new Date('2026-06-01T00:00:00Z');

describe('account lists', () => {
  it('come from every system that has users', () => {
    const gws = extractAccounts('gworkspace', sampleGworkspace(now))!;
    expect(gws.find(a => a.email === 'maria@acme.example')?.isAdmin).toBe(true);
    const aws = extractAccounts('aws', sampleAws(now))!;
    expect(aws.find(a => a.name === 'root account')?.isAdmin).toBe(true);
    expect(aws.find(a => a.name === 'ci-deploy')?.detail).toContain('access key');
    const gh = extractAccounts('github', sampleGithub(now))!;
    expect(gh.find(a => a.name === 'maria-lopez')?.isAdmin).toBe(true);
    const gcp = extractAccounts('gcp', sampleGcp(now))!;
    expect(gcp.some(a => a.isAdmin)).toBe(true);
    const dev = extractAccounts('devices', sampleDevices(now))!;
    expect(dev.map(a => a.system)).toContain('erp-db01 (local)');
    expect(extractAccounts('azure', {})).toBeNull();
    expect(extractAccounts('gworkspace', { tenant: 'x', collectedAt: '' })).toBeNull();
  });
});

describe('account flags', () => {
  const people = [
    { name: 'Sam Rivera', email: 'sam@acme.example', githubUsername: 'samr', endDate: new Date('2026-05-01') },
    { name: 'Maria Lopez', email: 'maria@acme.example', githubUsername: 'maria-lopez', endDate: null },
  ];
  it('match people by email or GitHub login', () => {
    expect(accountFlags({ provider: 'gworkspace', name: 'Sam', email: 'SAM@acme.example', isAdmin: false, lastActivity: now, active: true }, people, now).flags).toEqual(['left']);
    const m = accountFlags({ provider: 'github', name: 'maria-lopez', email: null, isAdmin: true, lastActivity: null, active: true }, people, now);
    expect(m.person?.name).toBe('Maria Lopez');
    expect(m.flags).toEqual(['admin']);
  });
  it('flag unknown, unused and never-used accounts', () => {
    expect(accountFlags({ provider: 'm365', name: 'x', email: 'x@acme.example', isAdmin: false, lastActivity: new Date('2025-01-01'), active: true }, people, now).flags).toEqual(['unknown', 'inactive']);
    expect(accountFlags({ provider: 'aws', name: 'svc', email: null, isAdmin: false, lastActivity: null, active: true }, people, now).flags).toEqual(['never_used']);
    expect(accountFlags({ provider: 'gworkspace', name: 'x', email: 'x@a.b', isAdmin: false, lastActivity: now, active: true }, [], now).flags).toEqual([]);
  });
});
