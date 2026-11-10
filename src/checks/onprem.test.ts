import { describe, expect, it } from 'vitest';
import { agentCommand } from '@/components/DevicesTab';
import { dnToDomain, fileTimeToIso, generalizedTimeToIso } from '@/connectors/ad';
import { sampleAd, sampleDevices } from '@/connectors/sample';
import { parseDeviceReport } from '@/devices/report';
import { DEVICE_CHECKS } from './devices';
import { AD_CHECKS } from './identity';
import type { CheckDef } from './types';

const now = new Date('2026-06-01T00:00:00Z');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (checks: CheckDef<any>[], id: string, inv: unknown) => checks.find(c => c.id === id)!.evaluate(inv);
const failing = (r: ReturnType<typeof run>) => r?.filter(x => x.status === 'fail').map(x => x.resourceName);

describe('parseDeviceReport', () => {
  it('accepts a report and fills defaults', () => {
    const r = parseDeviceReport({ machineId: 'abcdef123456', hostname: 'web-1', os: 'Linux', diskEncrypted: true, daysSinceUpdate: '4', owner: '', localAccounts: [{ name: 'deploy', lastLogin: null }] });
    expect(typeof r).toBe('object');
    if (typeof r === 'string') return;
    expect(r.role).toBe('server');
    expect(r.os).toBe('linux');
    expect(r.daysSinceUpdate).toBe(4);
    expect(r.firewallEnabled).toBeNull();
    expect(r.owner).toBeUndefined();
    expect(r.localAccounts).toEqual([{ name: 'deploy', admin: false, enabled: true, lastLogin: null }]);
  });
  it('rejects unusable input and strips control characters', () => {
    expect(parseDeviceReport([])).toMatch(/object/);
    expect(parseDeviceReport({ machineId: 'x', hostname: 'a', os: 'linux' })).toMatch(/machineId/);
    expect(parseDeviceReport({ machineId: 'abcdefgh', hostname: 'a', os: 'beos' })).toMatch(/os/);
    const r = parseDeviceReport({ machineId: 'abcdefgh', hostname: 'a\u0000b<x>', os: 'macos', screenLockMinutes: -5 });
    expect(typeof r !== 'string' && r.hostname).toBe('a b<x>');
    expect(typeof r !== 'string' && r.role).toBe('workstation');
    expect(typeof r !== 'string' && r.screenLockMinutes).toBeNull();
  });
  it('keeps "not readable" apart from "no screen lock"', () => {
    const r = parseDeviceReport({ machineId: 'abcdefgh', hostname: 'mac', os: 'macos' });
    expect(typeof r !== 'string' && r.screenLockMinutes).toBeUndefined();
    const inv = { collectedAt: new Date().toISOString(), devices: [{ ...(r as object), id: 'x', lastSeenAt: new Date().toISOString() }] };
    expect(run(DEVICE_CHECKS, 'devices.screen_lock', inv)).toBeNull();
  });
});

describe('device checks', () => {
  const inv = sampleDevices(now);
  it('flag the sample problems', () => {
    expect(failing(run(DEVICE_CHECKS, 'devices.disk_encryption', inv))).toEqual(['erp-db01', 'ACME-LT-014']);
    expect(failing(run(DEVICE_CHECKS, 'devices.os_updates', inv))).toEqual(['erp-db01']);
    expect(failing(run(DEVICE_CHECKS, 'devices.screen_lock', inv))).toEqual(['ACME-LT-014']);
    expect(failing(run(DEVICE_CHECKS, 'devices.remote_login', inv))).toEqual(['erp-db01']);
    expect(failing(run(DEVICE_CHECKS, 'devices.audit_logging', inv))).toEqual(['erp-db01']);
    expect(failing(run(DEVICE_CHECKS, 'devices.password_policy', inv))).toEqual(['fs01.corp.acme.example', 'ACME-LT-014']);
    expect(failing(run(DEVICE_CHECKS, 'devices.inactive_accounts', inv))).toEqual(['backupop on fs01.corp.acme.example', 'olddba on erp-db01']);
    expect(failing(run(DEVICE_CHECKS, 'devices.reporting', inv))).toEqual(['ACME-LT-014']);
  });
  it('skip Linux for malware protection and servers for screen lock', () => {
    expect(run(DEVICE_CHECKS, 'devices.malware_protection', inv)?.map(r => r.resourceName)).not.toContain('erp-db01');
    expect(run(DEVICE_CHECKS, 'devices.screen_lock', inv)?.map(r => r.resourceName)).toEqual(['Marias-MacBook-Pro', 'ACME-LT-014']);
  });
  it('report "not evaluated" when no device could read a setting', () => {
    const only = { collectedAt: now.toISOString(), devices: [{ ...inv.devices![2], diskEncrypted: null }] };
    expect(run(DEVICE_CHECKS, 'devices.disk_encryption', only)).toBeNull();
  });
});

describe('Active Directory', () => {
  const inv = sampleAd(now);
  it('checks password policy, flags, leavers and stale accounts', () => {
    expect(failing(run(AD_CHECKS, 'ad.password_policy', inv))).toEqual(['corp.acme.example']);
    expect(failing(run(AD_CHECKS, 'ad.password_flags', inv))).toEqual(['svc-backup@acme.example', 'scanner@acme.example']);
    expect(failing(run(AD_CHECKS, 'ad.former_employees', inv))).toEqual(['sam.rivera@acme.example']);
    expect(failing(run(AD_CHECKS, 'ad.inactive_users', inv))).toEqual(['scanner@acme.example']);
    expect(AD_CHECKS.some(c => c.id.includes('mfa'))).toBe(false);
  });
  it('converts AD time formats and names', () => {
    expect(fileTimeToIso('133000000000000000')).toBe('2022-06-18T04:26:40.000Z');
    expect(fileTimeToIso('0')).toBeNull();
    expect(fileTimeToIso('9223372036854775807')).toBeNull();
    expect(generalizedTimeToIso('20240131120000.0Z')).toBe('2024-01-31T12:00:00.000Z');
    expect(dnToDomain('DC=corp,DC=example,DC=com')).toBe('corp.example.com');
  });
});

describe('agent install command', () => {
  it('builds the shell and PowerShell commands', () => {
    expect(agentCommand('linux', 'https://cl.example.com', 'cld_abc', { role: '', owner: '', schedule: true }))
      .toBe('curl -fsSL https://cl.example.com/api/devices/agent/controllayer-agent.sh | sudo bash -s -- --url https://cl.example.com --key cld_abc --schedule');
    expect(agentCommand('windows', 'https://cl.example.com', 'cld_abc', { role: 'workstation', owner: 'a@b.co', schedule: false }))
      .toBe("& ([scriptblock]::Create((irm 'https://cl.example.com/api/devices/agent/controllayer-agent.ps1'))) -Url 'https://cl.example.com' -Key 'cld_abc' -Role workstation -Owner 'a@b.co'");
  });
});
