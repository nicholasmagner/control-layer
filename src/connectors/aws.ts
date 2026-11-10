import { CloudTrailClient, DescribeTrailsCommand, GetTrailStatusCommand } from '@aws-sdk/client-cloudtrail';
import { EC2Client, paginateDescribeInstances, paginateDescribeSecurityGroups, paginateDescribeVolumes } from '@aws-sdk/client-ec2';
import {
  GenerateCredentialReportCommand,
  GetAccountPasswordPolicyCommand,
  GetCredentialReportCommand,
  IAMClient,
} from '@aws-sdk/client-iam';
import { paginateDescribeDBInstances, RDSClient } from '@aws-sdk/client-rds';
import {
  GetBucketEncryptionCommand,
  GetBucketPolicyStatusCommand,
  GetPublicAccessBlockCommand,
  ListBucketsCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { fromIni } from '@aws-sdk/credential-providers';
import type { AwsCredentialUser, AwsInventory } from '@/checks/aws';
import { CollectResult, section } from './common';
import type { AwsConnection } from './config';

/** Credentials for every AWS client, from the saved connection. */
type Creds = { credentials?: ReturnType<typeof fromIni> | { accessKeyId: string; secretAccessKey: string } };

export function awsClientCredentials(conn: AwsConnection): Creds {
  if (conn.keys) return { credentials: { accessKeyId: conn.keys.accessKeyId, secretAccessKey: conn.keys.secretAccessKey } };
  if (conn.profile) return { credentials: fromIni({ profile: conn.profile }) };
  return {}; // standard AWS credential chain (environment, profile, instance role)
}

/**
 * Read-only AWS collector. Uses the standard AWS credential chain
 * (environment variables, shared profile, SSO, or an attached IAM role).
 * The AWS managed policy "SecurityAudit" grants everything this needs.
 */


const isTrue = (v: string | undefined) => v === 'true';
const dateOrUndefined = (v: string | undefined) => (v && /^\d{4}-/.test(v) ? v : undefined);

/** Parses the IAM credential report CSV into normalized users. */
export function parseCredentialReport(csv: string): AwsCredentialUser[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines.shift()?.split(',') ?? [];
  return lines.filter(Boolean).map(line => {
    const cols = line.split(',');
    const row: Record<string, string> = {};
    header.forEach((h, i) => { row[h] = cols[i]; });
    const isRoot = row.user === '<root_account>';
    return {
      user: isRoot ? 'root' : row.user,
      arn: row.arn,
      isRoot,
      passwordEnabled: isTrue(row.password_enabled),
      mfaActive: isTrue(row.mfa_active),
      passwordLastUsed: dateOrUndefined(row.password_last_used),
      createdAt: dateOrUndefined(row.user_creation_time),
      accessKeys: [1, 2].map(n => ({
        active: isTrue(row[`access_key_${n}_active`]),
        lastRotated: dateOrUndefined(row[`access_key_${n}_last_rotated`]),
        lastUsed: dateOrUndefined(row[`access_key_${n}_last_used_date`]),
      })),
    };
  });
}

async function credentialReport(iam: IAMClient): Promise<AwsCredentialUser[]> {
  // The report is generated asynchronously; poll until it is ready.
  for (let attempt = 0; attempt < 10; attempt++) {
    const gen = await iam.send(new GenerateCredentialReportCommand({}));
    if (gen.State === 'COMPLETE') break;
    await new Promise(r => setTimeout(r, 1500));
  }
  const report = await iam.send(new GetCredentialReportCommand({}));
  const csv = new TextDecoder().decode(report.Content);
  return parseCredentialReport(csv);
}

async function passwordPolicy(iam: IAMClient): Promise<NonNullable<AwsInventory['passwordPolicy']>> {
  try {
    const { PasswordPolicy: p } = await iam.send(new GetAccountPasswordPolicyCommand({}));
    return { exists: true, minimumLength: p?.MinimumPasswordLength, requireNumbers: p?.RequireNumbers, requireSymbols: p?.RequireSymbols };
  } catch (err) {
    if ((err as { name?: string }).name === 'NoSuchEntityException') return { exists: false };
    throw err;
  }
}

async function trails(region: string, c: Creds): Promise<NonNullable<AwsInventory['trails']>> {
  const ct = new CloudTrailClient({ region, ...c });
  const { trailList = [] } = await ct.send(new DescribeTrailsCommand({ includeShadowTrails: true }));
  const out = [];
  for (const t of trailList) {
    if (!t.TrailARN) continue;
    let isLogging = false;
    try {
      const status = await ct.send(new GetTrailStatusCommand({ Name: t.TrailARN }));
      isLogging = !!status.IsLogging;
    } catch { /* trail in another region we cannot query: treat as not logging */ }
    out.push({ name: t.Name ?? t.TrailARN, isMultiRegion: !!t.IsMultiRegionTrail, isLogging, logFileValidation: !!t.LogFileValidationEnabled });
  }
  return out;
}

async function buckets(defaultRegion: string, c: Creds): Promise<NonNullable<AwsInventory['buckets']>> {
  const s3 = new S3Client({ region: defaultRegion, ...c });
  const { Buckets = [] } = await s3.send(new ListBucketsCommand({}));
  const clients = new Map<string, S3Client>();
  const clientFor = (region: string) => {
    if (!clients.has(region)) clients.set(region, new S3Client({ region, ...c }));
    return clients.get(region)!;
  };

  const out = [];
  for (const b of Buckets) {
    if (!b.Name) continue;
    const client = clientFor(b.BucketRegion || defaultRegion);
    let blockPublicAccess = false;
    let isPublic = false;
    let encrypted = false;
    try {
      const pab = await client.send(new GetPublicAccessBlockCommand({ Bucket: b.Name }));
      const c = pab.PublicAccessBlockConfiguration;
      blockPublicAccess = !!(c?.BlockPublicAcls && c.BlockPublicPolicy && c.IgnorePublicAcls && c.RestrictPublicBuckets);
    } catch { /* NoSuchPublicAccessBlockConfiguration = not blocked */ }
    try {
      const ps = await client.send(new GetBucketPolicyStatusCommand({ Bucket: b.Name }));
      isPublic = !!ps.PolicyStatus?.IsPublic;
    } catch { /* NoSuchBucketPolicy = no policy, not public via policy */ }
    try {
      const enc = await client.send(new GetBucketEncryptionCommand({ Bucket: b.Name }));
      encrypted = (enc.ServerSideEncryptionConfiguration?.Rules?.length ?? 0) > 0;
    } catch { /* no default encryption configured */ }
    out.push({ name: b.Name, blockPublicAccess, isPublic, encrypted });
  }
  return out;
}

async function ec2(region: string, c: Creds) {
  const client = new EC2Client({ region, ...c });
  const instances: NonNullable<AwsInventory['instances']> = [];
  for await (const page of paginateDescribeInstances({ client }, {})) {
    for (const r of page.Reservations ?? []) {
      for (const i of r.Instances ?? []) {
        if (!i.InstanceId) continue;
        instances.push({
          id: i.InstanceId, region, publicIp: i.PublicIpAddress, state: i.State?.Name,
          name: i.Tags?.find(t => t.Key === 'Name')?.Value,
        });
      }
    }
  }

  const securityGroups: NonNullable<AwsInventory['securityGroups']> = [];
  for await (const page of paginateDescribeSecurityGroups({ client }, {})) {
    for (const g of page.SecurityGroups ?? []) {
      if (!g.GroupId) continue;
      securityGroups.push({
        id: g.GroupId, name: g.GroupName ?? g.GroupId, region,
        ingress: (g.IpPermissions ?? []).map(p => ({
          protocol: p.IpProtocol ?? '-1', fromPort: p.FromPort, toPort: p.ToPort,
          sources: [...(p.IpRanges ?? []).map(r => r.CidrIp ?? ''), ...(p.Ipv6Ranges ?? []).map(r => r.CidrIpv6 ?? '')],
        })),
      });
    }
  }

  const volumes: NonNullable<AwsInventory['volumes']> = [];
  for await (const page of paginateDescribeVolumes({ client }, {})) {
    for (const v of page.Volumes ?? []) if (v.VolumeId) volumes.push({ id: v.VolumeId, region, encrypted: !!v.Encrypted });
  }

  return { instances, securityGroups, volumes };
}

async function rds(region: string, c: Creds): Promise<NonNullable<AwsInventory['databases']>> {
  const client = new RDSClient({ region, ...c });
  const out: NonNullable<AwsInventory['databases']> = [];
  for await (const page of paginateDescribeDBInstances({ client }, {})) {
    for (const d of page.DBInstances ?? []) {
      if (!d.DBInstanceIdentifier) continue;
      out.push({
        id: d.DBInstanceIdentifier, region, engine: d.Engine ?? 'unknown',
        encrypted: !!d.StorageEncrypted, publiclyAccessible: !!d.PubliclyAccessible,
        backupRetentionDays: d.BackupRetentionPeriod ?? 0,
      });
    }
  }
  return out;
}

export async function collectAws(conn: AwsConnection): Promise<CollectResult<AwsInventory>> {
  const regions = conn.regions;
  const c = awsClientCredentials(conn);
  const home = regions[0];
  const iam = new IAMClient({ region: home, ...c });
  const errors: string[] = [];
  const inventory: AwsInventory = { collectedAt: new Date().toISOString(), regions };

  inventory.credentialReport = await section('IAM credential report', errors, () => credentialReport(iam));
  const root = inventory.credentialReport?.find(u => u.isRoot);
  inventory.accountId = root?.arn.split(':')[4];
  inventory.passwordPolicy = await section('IAM password policy', errors, () => passwordPolicy(iam));
  inventory.trails = await section('CloudTrail', errors, async () => (await Promise.all(regions.map(r => trails(r, c)))).flat());
  inventory.buckets = await section('S3', errors, () => buckets(home, c));

  const ec2Data = await section('EC2', errors, async () => Promise.all(regions.map(r => ec2(r, c))));
  if (ec2Data) {
    inventory.instances = ec2Data.flatMap(d => d.instances);
    inventory.securityGroups = ec2Data.flatMap(d => d.securityGroups);
    inventory.volumes = ec2Data.flatMap(d => d.volumes);
  }
  inventory.databases = await section('RDS', errors, async () => (await Promise.all(regions.map(r => rds(r, c)))).flat());

  // If nothing at all could be read, the credentials are missing or invalid.
  const anything = [inventory.credentialReport, inventory.passwordPolicy, inventory.trails, inventory.buckets, ec2Data, inventory.databases].some(Boolean);
  if (!anything) throw new Error(`Could not read anything from AWS. ${errors[0] ?? ''}`.trim());
  return { inventory, errors, account: inventory.accountId ?? 'AWS account' };
}

