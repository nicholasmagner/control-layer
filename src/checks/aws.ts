import { adminPortsInRange, coversTcp, isOpenSource } from './network';
import { CheckDef, DAY_MS, MAX_CREDENTIAL_AGE_DAYS, ResourceResult } from './types';

// ---------------------------------------------------------------------------
// Normalized inventory. Every section is optional: undefined means the
// collector could not read it (usually a missing permission).
// ---------------------------------------------------------------------------

export interface AwsCredentialUser {
  user: string;
  arn: string;
  isRoot: boolean;
  passwordEnabled: boolean;
  mfaActive: boolean;
  passwordLastUsed?: string;
  createdAt?: string;
  accessKeys: { active: boolean; lastRotated?: string; lastUsed?: string }[];
}

export interface AwsInventory {
  accountId?: string;
  collectedAt: string;
  regions: string[];
  credentialReport?: AwsCredentialUser[];
  passwordPolicy?: { exists: boolean; minimumLength?: number; requireNumbers?: boolean; requireSymbols?: boolean };
  trails?: { name: string; isMultiRegion: boolean; isLogging: boolean; logFileValidation: boolean }[];
  buckets?: { name: string; blockPublicAccess: boolean; isPublic: boolean; encrypted: boolean }[];
  instances?: { id: string; name?: string; region: string; publicIp?: string; state?: string }[];
  securityGroups?: {
    id: string;
    name: string;
    region: string;
    ingress: { protocol: string; fromPort?: number; toPort?: number; sources: string[] }[];
  }[];
  volumes?: { id: string; region: string; encrypted: boolean }[];
  databases?: {
    id: string;
    region: string;
    engine: string;
    encrypted: boolean;
    publiclyAccessible: boolean;
    backupRetentionDays: number;
  }[];
}

function daysSince(iso: string | undefined, now: string): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.parse(now) - t) / DAY_MS);
}

const rootOf = (inv: AwsInventory) => inv.credentialReport?.find(u => u.isRoot);
const humans = (inv: AwsInventory) => inv.credentialReport?.filter(u => !u.isRoot);

export const AWS_CHECKS: CheckDef<AwsInventory>[] = [
  {
    id: 'aws.root_mfa',
    provider: 'aws',
    title: 'Root account has MFA',
    description: 'The AWS root user can do anything in the account and must be protected with multi-factor authentication.',
    severity: 'High',
    remediation: 'Sign in as the root user, open "Security credentials", and assign an MFA device (a hardware key is best).',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.4.2'] },
    evaluate: inv => {
      const root = rootOf(inv);
      if (!root) return null;
      return [{
        resourceId: root.arn, resourceName: 'root account',
        status: root.mfaActive ? 'pass' : 'fail',
        message: root.mfaActive ? 'Root account has MFA enabled.' : 'Root account does not have MFA enabled.',
      }];
    },
  },
  {
    id: 'aws.root_access_keys',
    provider: 'aws',
    title: 'Root account has no access keys',
    description: 'Access keys on the root user give unrestricted programmatic access and should not exist.',
    severity: 'High',
    remediation: 'Sign in as the root user, open "Security credentials", and delete every access key. Use IAM roles or IAM users for automation.',
    controls: { SOC2: ['CC6.1', 'CC6.3'], CMMC: ['AC.L1-3.1.2'], PCI: ['7.2.1'] },
    evaluate: inv => {
      const root = rootOf(inv);
      if (!root) return null;
      const active = root.accessKeys.filter(k => k.active).length;
      return [{
        resourceId: root.arn, resourceName: 'root account',
        status: active === 0 ? 'pass' : 'fail',
        message: active === 0 ? 'Root account has no active access keys.' : `Root account has ${active} active access key(s).`,
      }];
    },
  },
  {
    id: 'aws.iam_user_mfa',
    provider: 'aws',
    title: 'Console users have MFA',
    description: 'Every IAM user who can sign in to the console should use multi-factor authentication.',
    severity: 'High',
    remediation: 'In IAM > Users, open the user, go to "Security credentials" and choose "Assign MFA device". Consider an IAM policy that denies actions without MFA.',
    controls: { SOC2: ['CC6.1'], CMMC: ['AC.L1-3.1.1', 'IA.L1-3.5.2'], PCI: ['8.4.2'] },
    evaluate: inv => {
      const users = humans(inv);
      if (!users) return null;
      return users.filter(u => u.passwordEnabled).map<ResourceResult>(u => ({
        resourceId: u.arn, resourceName: u.user,
        status: u.mfaActive ? 'pass' : 'fail',
        message: u.mfaActive ? `${u.user} has MFA enabled.` : `${u.user} can sign in to the console without MFA.`,
        details: { userName: u.user },
      }));
    },
  },
  {
    id: 'aws.iam_inactive_users',
    provider: 'aws',
    title: 'No inactive IAM users',
    description: 'Accounts that have not been used for 90 days are often left over from people who left and should be disabled.',
    severity: 'Medium',
    remediation: 'Confirm the person still needs access. If not, delete their console password and access keys, then delete the IAM user.',
    controls: { SOC2: ['CC6.2'], CMMC: ['AC.L1-3.1.1'], PCI: ['8.2.6'] },
    evaluate: inv => {
      const users = humans(inv);
      if (!users) return null;
      return users.map<ResourceResult>(u => {
        const lastUses = [u.passwordLastUsed, ...u.accessKeys.map(k => k.lastUsed)]
          .map(d => daysSince(d, inv.collectedAt))
          .filter((d): d is number => d !== null);
        const created = daysSince(u.createdAt, inv.collectedAt);
        const idle = lastUses.length ? Math.min(...lastUses) : created;
        const inactive = idle !== null && idle > MAX_CREDENTIAL_AGE_DAYS;
        return {
          resourceId: u.arn, resourceName: u.user,
          status: inactive ? 'fail' : 'pass',
          message: inactive
            ? `${u.user} has not been used in ${idle} days.`
            : `${u.user} was used within the last ${MAX_CREDENTIAL_AGE_DAYS} days.`,
          details: { daysSinceLastUse: idle },
        };
      });
    },
  },
  {
    id: 'aws.access_key_rotation',
    provider: 'aws',
    title: 'Access keys rotated within 90 days',
    description: 'Long-lived access keys should be rotated at least every 90 days to limit the damage of a leaked key.',
    severity: 'Medium',
    remediation: 'Create a new access key for the user, update the systems that use it, then deactivate and delete the old key.',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.6.3'] },
    evaluate: inv => {
      const users = humans(inv);
      if (!users) return null;
      return users.filter(u => u.accessKeys.some(k => k.active)).map<ResourceResult>(u => {
        const ages = u.accessKeys.filter(k => k.active).map(k => daysSince(k.lastRotated, inv.collectedAt) ?? 0);
        const oldest = Math.max(...ages);
        const stale = oldest > MAX_CREDENTIAL_AGE_DAYS;
        return {
          resourceId: u.arn, resourceName: u.user,
          status: stale ? 'fail' : 'pass',
          message: stale ? `${u.user} has an access key that is ${oldest} days old.` : `${u.user}'s access keys are less than ${MAX_CREDENTIAL_AGE_DAYS} days old.`,
          details: { oldestKeyAgeDays: oldest },
        };
      });
    },
  },
  {
    id: 'aws.password_policy',
    provider: 'aws',
    title: 'Strong IAM password policy',
    description: 'The account password policy should require at least 12 characters, including numbers.',
    severity: 'Medium',
    remediation: 'In IAM > Account settings, edit the password policy: minimum length 12 or more and require at least one number.',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.3.6'] },
    evaluate: inv => {
      const p = inv.passwordPolicy;
      if (!p) return null;
      const ok = p.exists && (p.minimumLength ?? 0) >= 12 && !!p.requireNumbers;
      return [{
        resourceId: `account:${inv.accountId ?? 'unknown'}:password-policy`, resourceName: 'Account password policy',
        status: ok ? 'pass' : 'fail',
        message: !p.exists
          ? 'No account password policy is set (AWS defaults allow 8-character passwords).'
          : ok ? `Password policy requires ${p.minimumLength}+ characters and numbers.`
          : `Password policy is too weak (minimum length ${p.minimumLength ?? 'unset'}, numbers ${p.requireNumbers ? 'required' : 'not required'}).`,
        details: p,
      }];
    },
  },
  {
    id: 'aws.cloudtrail_enabled',
    provider: 'aws',
    title: 'CloudTrail logs all regions',
    description: 'A multi-region CloudTrail trail records every API call in the account - the audit log auditors expect to see.',
    severity: 'High',
    remediation: 'In CloudTrail, create a trail that applies to all regions, logs management events, and has log file validation enabled.',
    controls: { SOC2: ['CC7.2', 'CC2.1'], PCI: ['10.2.1'] },
    evaluate: inv => {
      if (!inv.trails) return null;
      const good = inv.trails.filter(t => t.isMultiRegion && t.isLogging);
      return [{
        resourceId: `account:${inv.accountId ?? 'unknown'}:cloudtrail`, resourceName: 'CloudTrail',
        status: good.length > 0 ? 'pass' : 'fail',
        message: good.length > 0
          ? `Multi-region trail active: ${good.map(t => t.name).join(', ')}.`
          : inv.trails.length === 0 ? 'No CloudTrail trails exist.' : 'No trail is both multi-region and currently logging.',
        details: { trails: inv.trails },
      }];
    },
  },
  {
    id: 'aws.s3_public',
    provider: 'aws',
    title: 'S3 buckets are not public',
    description: 'Buckets should block public access unless they intentionally host public content.',
    severity: 'High',
    remediation: 'Open the bucket > Permissions > "Block public access" and turn on all four settings. Remove any bucket policy statements that grant access to "*".',
    controls: { SOC2: ['CC6.1', 'CC6.6'], CMMC: ['AC.L1-3.1.22'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.buckets) return null;
      return inv.buckets.map<ResourceResult>(b => {
        const ok = !b.isPublic && b.blockPublicAccess;
        return {
          resourceId: `arn:aws:s3:::${b.name}`, resourceName: b.name,
          status: ok ? 'pass' : 'fail',
          message: b.isPublic ? `${b.name} is publicly accessible.`
            : ok ? `${b.name} blocks public access.` : `${b.name} does not have "Block public access" enabled.`,
        };
      });
    },
  },
  {
    id: 'aws.s3_encryption',
    provider: 'aws',
    title: 'S3 buckets encrypted at rest',
    description: 'Bucket default encryption protects stored objects.',
    severity: 'Medium',
    remediation: 'Open the bucket > Properties > "Default encryption" and enable SSE-S3 or SSE-KMS.',
    controls: { SOC2: ['C1.1', 'CC6.1'], PCI: ['3.5.1'] },
    evaluate: inv => {
      if (!inv.buckets) return null;
      return inv.buckets.map<ResourceResult>(b => ({
        resourceId: `arn:aws:s3:::${b.name}`, resourceName: b.name,
        status: b.encrypted ? 'pass' : 'fail',
        message: b.encrypted ? `${b.name} has default encryption.` : `${b.name} has no default encryption.`,
      }));
    },
  },
  {
    id: 'aws.sg_open_admin_ports',
    provider: 'aws',
    title: 'No SSH/RDP open to the internet',
    description: 'Security groups should not allow SSH (22) or RDP (3389) from anywhere on the internet.',
    severity: 'High',
    remediation: 'Edit the security group inbound rules: restrict SSH/RDP to known IP ranges, or remove them and use AWS Systems Manager Session Manager.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.1', 'AC.L1-3.1.20'], PCI: ['1.3.1'] },
    evaluate: inv => {
      if (!inv.securityGroups) return null;
      return inv.securityGroups.map<ResourceResult>(sg => {
        const open = new Set<number>();
        for (const rule of sg.ingress) {
          if (!coversTcp(rule.protocol) || !rule.sources.some(isOpenSource)) continue;
          const range: [number, number] = rule.protocol === '-1' ? [0, 65535] : [rule.fromPort ?? 0, rule.toPort ?? 65535];
          adminPortsInRange(range).forEach(p => open.add(p));
        }
        const ports = [...open].sort();
        return {
          resourceId: sg.id, resourceName: `${sg.name} (${sg.region})`,
          status: ports.length ? 'fail' : 'pass',
          message: ports.length ? `${sg.name} allows port ${ports.join(', ')} from the internet.` : `${sg.name} does not expose SSH/RDP to the internet.`,
          details: { openPorts: ports, region: sg.region },
        };
      });
    },
  },
  {
    id: 'aws.ec2_public_ip',
    provider: 'aws',
    title: 'EC2 instances without public IPs',
    description: 'Instances with public IP addresses are reachable from the internet. That is expected for some servers but should be intentional.',
    severity: 'Low',
    remediation: 'If the instance does not need to be reachable directly, move it to a private subnet behind a load balancer or remove its public IP / Elastic IP.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.5'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.instances) return null;
      return inv.instances.filter(i => i.state !== 'terminated').map<ResourceResult>(i => ({
        resourceId: i.id, resourceName: i.name ? `${i.name} (${i.id})` : i.id,
        status: i.publicIp ? 'fail' : 'pass',
        message: i.publicIp ? `${i.name ?? i.id} has public IP ${i.publicIp}.` : `${i.name ?? i.id} has no public IP.`,
        details: { region: i.region, publicIp: i.publicIp },
      }));
    },
  },
  {
    id: 'aws.ebs_encryption',
    provider: 'aws',
    title: 'EBS volumes encrypted',
    description: 'Disk volumes should be encrypted at rest.',
    severity: 'Medium',
    remediation: 'Enable "EBS encryption by default" in EC2 settings for each region. Existing volumes must be copied to an encrypted snapshot and replaced.',
    controls: { SOC2: ['C1.1'], PCI: ['3.5.1'] },
    evaluate: inv => {
      if (!inv.volumes) return null;
      return inv.volumes.map<ResourceResult>(v => ({
        resourceId: v.id, resourceName: `${v.id} (${v.region})`,
        status: v.encrypted ? 'pass' : 'fail',
        message: v.encrypted ? `${v.id} is encrypted.` : `${v.id} is not encrypted.`,
      }));
    },
  },
  {
    id: 'aws.rds_encryption',
    provider: 'aws',
    title: 'RDS databases encrypted',
    description: 'Databases should be encrypted at rest.',
    severity: 'High',
    remediation: 'Encryption can only be set at creation: take a snapshot, copy it with encryption enabled, and restore a new instance from the encrypted copy.',
    controls: { SOC2: ['C1.1', 'CC6.1'], PCI: ['3.5.1'] },
    evaluate: inv => {
      if (!inv.databases) return null;
      return inv.databases.map<ResourceResult>(d => ({
        resourceId: d.id, resourceName: `${d.id} (${d.engine})`,
        status: d.encrypted ? 'pass' : 'fail',
        message: d.encrypted ? `${d.id} is encrypted.` : `${d.id} is not encrypted at rest.`,
      }));
    },
  },
  {
    id: 'aws.rds_public',
    provider: 'aws',
    title: 'RDS databases not public',
    description: 'Databases should not be reachable from the internet.',
    severity: 'High',
    remediation: 'Modify the instance and set "Publicly accessible" to No. Make sure its security group only allows your application servers.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.5'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.databases) return null;
      return inv.databases.map<ResourceResult>(d => ({
        resourceId: d.id, resourceName: `${d.id} (${d.engine})`,
        status: d.publiclyAccessible ? 'fail' : 'pass',
        message: d.publiclyAccessible ? `${d.id} is publicly accessible.` : `${d.id} is private.`,
      }));
    },
  },
  {
    id: 'aws.rds_backups',
    provider: 'aws',
    title: 'RDS backups retained 7+ days',
    description: 'Automated backups should be kept long enough to recover from mistakes or incidents.',
    severity: 'Medium',
    remediation: 'Modify the instance and set the backup retention period to at least 7 days.',
    controls: { SOC2: ['A1.2'] },
    evaluate: inv => {
      if (!inv.databases) return null;
      return inv.databases.map<ResourceResult>(d => ({
        resourceId: d.id, resourceName: `${d.id} (${d.engine})`,
        status: d.backupRetentionDays >= 7 ? 'pass' : 'fail',
        message: `${d.id} keeps automated backups for ${d.backupRetentionDays} day(s).`,
        details: { backupRetentionDays: d.backupRetentionDays },
      }));
    },
  },
];
