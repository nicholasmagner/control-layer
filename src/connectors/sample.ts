import type { AwsInventory } from '@/checks/aws';
import type { AzureInventory } from '@/checks/azure';
import type { GcpInventory } from '@/checks/gcp';
import type { GithubInventory } from '@/checks/github';
import type { DirectoryUser, IdentityInventory } from '@/checks/identity';
import type { Provider } from '@/checks/types';
import type { CollectResult } from './common';

/**
 * Realistic sample environments for trying ControlLayer without connecting a
 * cloud account. They run through exactly the same checks as real scans.
 */

const daysAgo = (n: number, now: Date) => new Date(now.getTime() - n * 86_400_000).toISOString();

export function sampleAws(now = new Date()): AwsInventory {
  const acct = '111122223333';
  return {
    accountId: acct,
    collectedAt: now.toISOString(),
    regions: ['us-east-1', 'us-west-2'],
    credentialReport: [
      { user: 'root', arn: `arn:aws:iam::${acct}:root`, isRoot: true, passwordEnabled: false, mfaActive: true, accessKeys: [{ active: false }, { active: false }] },
      { user: 'maria.lopez', arn: `arn:aws:iam::${acct}:user/maria.lopez`, isRoot: false, passwordEnabled: true, mfaActive: true, passwordLastUsed: daysAgo(1, now), createdAt: daysAgo(400, now), accessKeys: [{ active: false }, { active: false }] },
      { user: 'dev.chen', arn: `arn:aws:iam::${acct}:user/dev.chen`, isRoot: false, passwordEnabled: true, mfaActive: false, passwordLastUsed: daysAgo(3, now), createdAt: daysAgo(200, now), accessKeys: [{ active: true, lastRotated: daysAgo(150, now), lastUsed: daysAgo(2, now) }, { active: false }] },
      { user: 'ci-deploy', arn: `arn:aws:iam::${acct}:user/ci-deploy`, isRoot: false, passwordEnabled: false, mfaActive: false, createdAt: daysAgo(300, now), accessKeys: [{ active: true, lastRotated: daysAgo(45, now), lastUsed: daysAgo(0, now) }, { active: false }] },
      { user: 'former.contractor', arn: `arn:aws:iam::${acct}:user/former.contractor`, isRoot: false, passwordEnabled: true, mfaActive: true, passwordLastUsed: daysAgo(160, now), createdAt: daysAgo(500, now), accessKeys: [{ active: false }, { active: false }] },
    ],
    passwordPolicy: { exists: true, minimumLength: 8, requireNumbers: true, requireSymbols: false },
    trails: [{ name: 'org-audit-trail', isMultiRegion: true, isLogging: true, logFileValidation: true }],
    buckets: [
      { name: 'acme-app-uploads', blockPublicAccess: true, isPublic: false, encrypted: true },
      { name: 'acme-db-backups', blockPublicAccess: true, isPublic: false, encrypted: true },
      { name: 'acme-marketing-assets', blockPublicAccess: false, isPublic: true, encrypted: true },
    ],
    instances: [
      { id: 'i-0a12bc34de56f7890', name: 'web-1', region: 'us-east-1', publicIp: '54.210.12.34', state: 'running' },
      { id: 'i-0b98cd76ef54a3210', name: 'worker-1', region: 'us-east-1', state: 'running' },
    ],
    securityGroups: [
      { id: 'sg-0web', name: 'web-sg', region: 'us-east-1', ingress: [{ protocol: 'tcp', fromPort: 443, toPort: 443, sources: ['0.0.0.0/0'] }] },
      { id: 'sg-0bastion', name: 'bastion-sg', region: 'us-east-1', ingress: [{ protocol: 'tcp', fromPort: 22, toPort: 22, sources: ['0.0.0.0/0'] }] },
      { id: 'sg-0db', name: 'db-sg', region: 'us-east-1', ingress: [{ protocol: 'tcp', fromPort: 5432, toPort: 5432, sources: ['10.0.0.0/16'] }] },
    ],
    volumes: [
      { id: 'vol-0web1root', region: 'us-east-1', encrypted: true },
      { id: 'vol-0worker1root', region: 'us-east-1', encrypted: false },
    ],
    databases: [
      { id: 'prod-postgres', region: 'us-east-1', engine: 'postgres', encrypted: true, publiclyAccessible: false, backupRetentionDays: 14 },
      { id: 'analytics-mysql', region: 'us-west-2', engine: 'mysql', encrypted: true, publiclyAccessible: false, backupRetentionDays: 1 },
    ],
  };
}

export function sampleGcp(now = new Date()): GcpInventory {
  const projectId = 'acme-data-platform';
  return {
    projectId,
    collectedAt: now.toISOString(),
    iamBindings: [
      { role: 'roles/owner', members: ['user:maria@acme.example'] },
      { role: 'roles/editor', members: ['serviceAccount:etl@acme-data-platform.iam.gserviceaccount.com'] },
      { role: 'roles/bigquery.dataViewer', members: ['group:analysts@acme.example'] },
    ],
    auditConfigs: [],
    serviceAccountKeys: [
      { account: 'etl@acme-data-platform.iam.gserviceaccount.com', keyId: '8f3a1c9e2b7d4f60', createdAt: daysAgo(210, now) },
      { account: 'reporting@acme-data-platform.iam.gserviceaccount.com', keyId: '1d2e3f4a5b6c7d8e', createdAt: daysAgo(20, now) },
    ],
    buckets: [
      { name: 'acme-raw-events', publicMembers: [], uniformAccess: true, publicAccessPrevention: 'enforced' },
      { name: 'acme-exports', publicMembers: [], uniformAccess: false },
    ],
    instances: [{ name: 'airflow-scheduler', zone: 'us-central1-a', externalIps: [] }],
    firewalls: [
      { name: 'default-allow-internal', direction: 'INGRESS', disabled: false, sourceRanges: ['10.128.0.0/9'], allowed: [{ protocol: 'tcp', ports: [] }] },
      { name: 'default-allow-ssh', direction: 'INGRESS', disabled: false, sourceRanges: ['0.0.0.0/0'], allowed: [{ protocol: 'tcp', ports: ['22'] }] },
    ],
    sqlInstances: [{ name: 'warehouse-pg', publicIpEnabled: false, authorizedNetworks: [], backupsEnabled: true, sslRequired: true }],
  };
}

export function sampleAzure(now = new Date()): AzureInventory {
  const subscriptionId = '00000000-1111-2222-3333-444444444444';
  const rg = `/subscriptions/${subscriptionId}/resourceGroups/acme-prod`;
  return {
    subscriptionId,
    collectedAt: now.toISOString(),
    storageAccounts: [
      { id: `${rg}/providers/Microsoft.Storage/storageAccounts/acmedocs`, name: 'acmedocs', allowBlobPublicAccess: false, httpsOnly: true, minTlsVersion: 'TLS1_2' },
      { id: `${rg}/providers/Microsoft.Storage/storageAccounts/acmelegacy`, name: 'acmelegacy', allowBlobPublicAccess: true, httpsOnly: true, minTlsVersion: 'TLS1_0' },
    ],
    networkSecurityGroups: [
      { id: `${rg}/providers/Microsoft.Network/networkSecurityGroups/app-nsg`, name: 'app-nsg', rules: [
        { name: 'allow-https', direction: 'Inbound', access: 'Allow', protocol: 'Tcp', sources: ['Internet'], ports: ['443'] },
      ] },
      { id: `${rg}/providers/Microsoft.Network/networkSecurityGroups/jumpbox-nsg`, name: 'jumpbox-nsg', rules: [
        { name: 'allow-rdp', direction: 'Inbound', access: 'Allow', protocol: '*', sources: ['*'], ports: ['3389'] },
      ] },
    ],
    publicIps: [{ id: `${rg}/providers/Microsoft.Network/publicIPAddresses/appgw-ip`, name: 'appgw-ip', ipAddress: '20.51.10.7', attachedTo: `${rg}/providers/Microsoft.Network/applicationGateways/app-gw/frontendIPConfigurations/public` }],
    sqlServers: [{ id: `${rg}/providers/Microsoft.Sql/servers/acme-sql`, name: 'acme-sql', firewallRules: [{ name: 'AllowAllWindowsAzureIps', start: '0.0.0.0', end: '0.0.0.0' }] }],
    activityLogExports: 1,
    keyVaults: [{ id: `${rg}/providers/Microsoft.KeyVault/vaults/acme-kv`, name: 'acme-kv', softDelete: true, purgeProtection: false }],
    defenderPlans: [{ name: 'VirtualMachines', tier: 'Standard' }, { name: 'SqlServers', tier: 'Free' }],
  };
}

/** Sample people who left, for the offboarding checks. */
const sampleFormer = (now: Date) => [
  { name: 'Sam Rivera', email: 'sam.rivera@acme.example', githubUsername: 'samr-dev', endDate: daysAgo(21, now) },
];

export function sampleGworkspace(now = new Date()): IdentityInventory {
  const u = (email: string, name: string, o: Partial<DirectoryUser> = {}): DirectoryUser => ({
    id: email, email, name, isAdmin: false, active: true, mfaRegistered: true, lastSignIn: daysAgo(1, now), createdAt: daysAgo(400, now), ...o,
  });
  return {
    tenant: 'acme.example',
    collectedAt: now.toISOString(),
    mfaEnforced: { enforced: false, how: '2-Step Verification is enforced for 4 of 6 active users' },
    users: [
      u('maria@acme.example', 'Maria Lopez', { isAdmin: true }),
      u('it-admin@acme.example', 'IT Admin', { isAdmin: true, lastSignIn: daysAgo(12, now) }),
      u('dev.chen@acme.example', 'Dev Chen', { mfaRegistered: false }),
      u('priya@acme.example', 'Priya Natarajan'),
      u('sam.rivera@acme.example', 'Sam Rivera', { lastSignIn: daysAgo(22, now) }),
      u('events@acme.example', 'Events Mailbox', { lastSignIn: daysAgo(140, now), mfaRegistered: false }),
      u('old.intern@acme.example', 'Former Intern', { active: false, lastSignIn: daysAgo(300, now) }),
    ],
    formerPeople: sampleFormer(now),
  };
}

export function sampleM365(now = new Date()): IdentityInventory {
  return {
    tenant: 'acme.onmicrosoft.com',
    collectedAt: now.toISOString(),
    mfaEnforced: { enforced: true, how: 'security defaults are on' },
    users: [
      { id: '1', email: 'maria@acme.onmicrosoft.com', name: 'Maria Lopez', isAdmin: true, active: true, mfaRegistered: true, lastSignIn: daysAgo(0, now) },
      { id: '2', email: 'finance@acme.onmicrosoft.com', name: 'Finance', isAdmin: false, active: true, mfaRegistered: true, lastSignIn: daysAgo(3, now) },
      { id: '3', email: 'partner_contoso.com#EXT#@acme.onmicrosoft.com', name: 'Partner (guest)', isAdmin: false, active: true, guest: true, mfaRegistered: false, lastSignIn: daysAgo(30, now) },
    ],
    formerPeople: sampleFormer(now),
  };
}

export function sampleGithub(now = new Date()): GithubInventory {
  return {
    org: 'acme-example',
    collectedAt: now.toISOString(),
    twoFactorRequired: false,
    defaultRepoPermission: 'read',
    members: [
      { login: 'maria-lopez', role: 'admin', twoFactorEnabled: true },
      { login: 'devchen', role: 'member', twoFactorEnabled: true },
      { login: 'priya-n', role: 'member', twoFactorEnabled: false },
      { login: 'samr-dev', role: 'member', twoFactorEnabled: true },
    ],
    repos: [
      { name: 'web-app', private: true, defaultBranch: 'main', requiredReviews: 1, secretScanning: true, dependabotAlerts: true },
      { name: 'api', private: true, defaultBranch: 'main', requiredReviews: 2, secretScanning: true, dependabotAlerts: true },
      { name: 'infrastructure', private: true, defaultBranch: 'main', requiredReviews: 0, secretScanning: false, dependabotAlerts: true },
      { name: 'docs', private: false, defaultBranch: 'main', requiredReviews: 1, secretScanning: true, dependabotAlerts: false },
    ],
    formerPeople: sampleFormer(now),
  };
}

type AnyInventory = AwsInventory | GcpInventory | AzureInventory | IdentityInventory | GithubInventory;

export function sampleInventory(provider: Provider): CollectResult<AnyInventory> {
  switch (provider) {
    case 'aws': { const inventory = sampleAws(); return { inventory, errors: [], account: `${inventory.accountId} (sample)` }; }
    case 'gcp': { const inventory = sampleGcp(); return { inventory, errors: [], account: `${inventory.projectId} (sample)` }; }
    case 'azure': { const inventory = sampleAzure(); return { inventory, errors: [], account: 'acme-prod (sample)' }; }
    case 'gworkspace': return { inventory: sampleGworkspace(), errors: [], account: 'acme.example (sample)' };
    case 'm365': return { inventory: sampleM365(), errors: [], account: 'acme.onmicrosoft.com (sample)' };
    case 'github': return { inventory: sampleGithub(), errors: [], account: 'acme-example (sample)' };
  }
}
