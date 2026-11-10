import { describe, expect, it } from 'vitest';
import { ALL_CHECKS, checksFor } from '@/checks';
import { AWS_CHECKS } from '@/checks/aws';
import { AZURE_CHECKS } from '@/checks/azure';
import { GCP_CHECKS } from '@/checks/gcp';
import { adminPortsInRange, isOpenSource, parsePortRange } from '@/checks/network';
import { sampleAws, sampleAzure, sampleGcp } from '@/connectors/sample';
import { getControlDef } from '@/frameworks';

const NOW = new Date('2026-06-01T00:00:00Z');
const byId = <T,>(checks: { id: string; evaluate: (i: T) => unknown }[], id: string) => checks.find(c => c.id === id)!;
const statuses = (r: unknown) => (r as { resourceName?: string; status: string }[]).map(x => `${x.resourceName}:${x.status}`);

describe('check catalog', () => {
  it('has unique ids', () => {
    const ids = ALL_CHECKS.map(c => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('only maps to controls that exist in the framework catalogs', () => {
    for (const check of ALL_CHECKS) {
      for (const [fw, ids] of Object.entries(check.controls)) {
        for (const id of ids ?? []) {
          expect(getControlDef(fw, id), `${check.id} -> ${fw} ${id}`).toBeDefined();
        }
      }
    }
  });

  it('covers every provider', () => {
    expect(checksFor('aws').length).toBeGreaterThan(5);
    expect(checksFor('gcp').length).toBeGreaterThan(5);
    expect(checksFor('azure').length).toBeGreaterThan(5);
  });
});

describe('network helpers', () => {
  it('recognizes internet-wide sources', () => {
    for (const s of ['0.0.0.0/0', '::/0', '*', 'Internet', 'Any']) expect(isOpenSource(s)).toBe(true);
    for (const s of ['10.0.0.0/8', '203.0.113.4/32', '', undefined]) expect(isOpenSource(s)).toBe(false);
  });

  it('parses port specs and finds admin ports', () => {
    expect(parsePortRange('22')).toEqual([22, 22]);
    expect(parsePortRange('20-30')).toEqual([20, 30]);
    expect(parsePortRange('*')).toEqual([0, 65535]);
    expect(adminPortsInRange(parsePortRange('1-1024'))).toEqual([22]);
    expect(adminPortsInRange(parsePortRange(undefined))).toEqual([22, 3389]);
    expect(adminPortsInRange(parsePortRange('443'))).toEqual([]);
  });
});

describe('AWS checks on the sample account', () => {
  const inv = sampleAws(NOW);

  it('flags console users without MFA but not API-only users', () => {
    expect(statuses(byId(AWS_CHECKS, 'aws.iam_user_mfa').evaluate(inv))).toEqual([
      'maria.lopez:pass', 'dev.chen:fail', 'former.contractor:pass',
    ]);
  });

  it('flags inactive users and stale keys', () => {
    expect(statuses(byId(AWS_CHECKS, 'aws.iam_inactive_users').evaluate(inv))).toContain('former.contractor:fail');
    expect(statuses(byId(AWS_CHECKS, 'aws.access_key_rotation').evaluate(inv))).toEqual(['dev.chen:fail', 'ci-deploy:pass']);
  });

  it('flags SSH open to the world but not HTTPS', () => {
    const r = statuses(byId(AWS_CHECKS, 'aws.sg_open_admin_ports').evaluate(inv));
    expect(r).toEqual(['web-sg (us-east-1):pass', 'bastion-sg (us-east-1):fail', 'db-sg (us-east-1):pass']);
  });

  it('treats an all-traffic rule from anywhere as exposing admin ports', () => {
    const r = byId(AWS_CHECKS, 'aws.sg_open_admin_ports').evaluate({
      ...inv, securityGroups: [{ id: 'sg-1', name: 'wide', region: 'us-east-1', ingress: [{ protocol: '-1', sources: ['0.0.0.0/0'] }] }],
    }) as { status: string; details: { openPorts: number[] } }[];
    expect(r[0].status).toBe('fail');
    expect(r[0].details.openPorts).toEqual([22, 3389]);
  });

  it('flags a weak password policy and a missing one', () => {
    const check = byId(AWS_CHECKS, 'aws.password_policy');
    expect(statuses(check.evaluate(inv))).toEqual(['Account password policy:fail']);
    expect(statuses(check.evaluate({ ...inv, passwordPolicy: { exists: false } }))).toEqual(['Account password policy:fail']);
    expect(statuses(check.evaluate({ ...inv, passwordPolicy: { exists: true, minimumLength: 14, requireNumbers: true } }))).toEqual(['Account password policy:pass']);
  });

  it('returns null (not evaluated) when a section could not be collected', () => {
    for (const check of AWS_CHECKS) {
      expect(check.evaluate({ collectedAt: NOW.toISOString(), regions: [] }), check.id).toBeNull();
    }
  });
});

describe('GCP checks on the sample project', () => {
  const inv = sampleGcp(NOW);

  it('flags editor grants to service accounts but allows a single human owner', () => {
    const r = statuses(byId(GCP_CHECKS, 'gcp.basic_roles').evaluate(inv));
    expect(r).toContain('user:maria@acme.example (owner):pass');
    expect(r).toContain('serviceAccount:etl@acme-data-platform.iam.gserviceaccount.com (editor):fail');
  });

  it('flags the default SSH rule and old service account keys', () => {
    expect(statuses(byId(GCP_CHECKS, 'gcp.firewall_open_admin').evaluate(inv))).toEqual(['default-allow-internal:pass', 'default-allow-ssh:fail']);
    const keys = statuses(byId(GCP_CHECKS, 'gcp.sa_key_rotation').evaluate(inv));
    expect(keys.filter(k => k.endsWith(':fail'))).toHaveLength(1);
  });

  it('requires data access audit logs for all services', () => {
    const check = byId(GCP_CHECKS, 'gcp.audit_logging');
    expect(statuses(check.evaluate(inv))[0]).toMatch(/:fail$/);
    expect(statuses(check.evaluate({ ...inv, auditConfigs: [{ service: 'allServices', logTypes: ['ADMIN_READ', 'DATA_READ', 'DATA_WRITE'] }] }))[0]).toMatch(/:pass$/);
  });

  it('returns null for every check on an empty inventory', () => {
    for (const check of GCP_CHECKS) expect(check.evaluate({ projectId: 'p', collectedAt: NOW.toISOString() }), check.id).toBeNull();
  });
});

describe('Azure checks on the sample subscription', () => {
  const inv = sampleAzure(NOW);

  it('flags RDP open to any source', () => {
    expect(statuses(byId(AZURE_CHECKS, 'azure.nsg_open_admin').evaluate(inv))).toEqual(['app-nsg:pass', 'jumpbox-nsg:fail']);
  });

  it('flags public blob access and old TLS', () => {
    expect(statuses(byId(AZURE_CHECKS, 'azure.storage_public_access').evaluate(inv))).toEqual(['acmedocs:pass', 'acmelegacy:fail']);
    expect(statuses(byId(AZURE_CHECKS, 'azure.storage_secure_transfer').evaluate(inv))).toEqual(['acmedocs:pass', 'acmelegacy:fail']);
  });

  it('does not treat the "Allow Azure services" SQL rule as open to the internet', () => {
    expect(statuses(byId(AZURE_CHECKS, 'azure.sql_open_firewall').evaluate(inv))).toEqual(['acme-sql:pass']);
    const open = { ...inv, sqlServers: [{ id: 'x', name: 'db', firewallRules: [{ name: 'all', start: '0.0.0.0', end: '255.255.255.255' }] }] };
    expect(statuses(byId(AZURE_CHECKS, 'azure.sql_open_firewall').evaluate(open))).toEqual(['db:fail']);
  });

  it('returns null for every check on an empty inventory', () => {
    for (const check of AZURE_CHECKS) expect(check.evaluate({ subscriptionId: 's', collectedAt: NOW.toISOString() }), check.id).toBeNull();
  });
});
