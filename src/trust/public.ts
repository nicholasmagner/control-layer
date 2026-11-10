import { createHash, randomBytes } from 'node:crypto';
import { latestCheckOutcomes } from '@/assessment/engine';
import type { CheckOutcome } from '@/assessment/status';
import { prisma } from '@/db/prisma';
import { getFramework } from '@/frameworks';
import { getSettings } from '@/lib/settings';
import { loadTrustConfig } from './config';

/**
 * Security practices shown on the public Trust Center. A practice is shown as
 * verified only when at least one of its checks ran in a real scan and none
 * of them currently fail. Nothing is shown from sample data.
 */
export const PRACTICES: { id: string; title: string; text: string; checks: string[] }[] = [
  {
    id: 'mfa', title: 'Multi-factor authentication', text: 'Company, cloud and code accounts require a second sign-in factor.',
    checks: ['aws.root_mfa', 'aws.iam_user_mfa', 'gworkspace.mfa_enforced', 'gworkspace.user_mfa', 'm365.mfa_enforced', 'm365.user_mfa', 'github.org_2fa_required', 'github.member_2fa'],
  },
  {
    id: 'offboarding', title: 'Prompt offboarding', text: 'Access is removed when people leave, and unused accounts are disabled.',
    checks: ['gworkspace.former_employees', 'm365.former_employees', 'github.former_members', 'gworkspace.inactive_users', 'm365.inactive_users', 'aws.iam_inactive_users'],
  },
  {
    id: 'least-privilege', title: 'Least-privilege access', text: 'Administrative access is limited to the people who need it.',
    checks: ['gworkspace.admin_count', 'm365.admin_count', 'github.default_permission', 'gcp.basic_roles', 'aws.root_access_keys'],
  },
  {
    id: 'encryption-rest', title: 'Encryption at rest', text: 'Databases, disks and storage are encrypted.',
    checks: ['aws.s3_encryption', 'aws.ebs_encryption', 'aws.rds_encryption'],
  },
  {
    id: 'encryption-transit', title: 'Encryption in transit', text: 'Data is sent over encrypted connections.',
    checks: ['azure.storage_secure_transfer', 'gcp.sql_ssl'],
  },
  {
    id: 'no-public-data', title: 'No public data storage', text: 'Storage buckets and databases are not open to the internet.',
    checks: ['aws.s3_public', 'gcp.bucket_public', 'azure.storage_public_access', 'aws.rds_public', 'gcp.sql_public', 'azure.sql_open_firewall'],
  },
  {
    id: 'network', title: 'Restricted network access', text: 'Administrative ports are not exposed to the internet.',
    checks: ['aws.sg_open_admin_ports', 'gcp.firewall_open_admin', 'azure.nsg_open_admin'],
  },
  {
    id: 'logging', title: 'Audit logging', text: 'Administrative activity in our cloud accounts is logged.',
    checks: ['aws.cloudtrail_enabled', 'gcp.audit_logging', 'azure.activity_log_export'],
  },
  {
    id: 'backups', title: 'Database backups', text: 'Production databases are backed up automatically.',
    checks: ['aws.rds_backups', 'gcp.sql_backups'],
  },
  {
    id: 'code-review', title: 'Peer-reviewed code changes', text: 'Changes to production code are reviewed and approved before they merge.',
    checks: ['github.branch_protection'],
  },
  {
    id: 'vulnerabilities', title: 'Vulnerability and secret scanning', text: 'Dependencies and code are scanned for known vulnerabilities and leaked secrets.',
    checks: ['github.dependabot_alerts', 'github.secret_scanning', 'azure.defender_servers'],
  },
];

/** Pure: practices whose checks ran and all pass. */
export function verifiedPractices(outcomes: Map<string, CheckOutcome>) {
  return PRACTICES.filter(p => {
    const ran = p.checks.map(id => outcomes.get(id)).filter((o): o is CheckOutcome => !!o && o.passed + o.failed > 0);
    return ran.length > 0 && ran.every(o => o.failed === 0);
  }).map(({ id, title, text }) => ({ id, title, text }));
}

export async function trustPageData() {
  const config = await loadTrustConfig();
  if (!config.enabled) return null;
  const [settings, documents, policies, sampleRuns, lastRun] = await Promise.all([
    getSettings(),
    prisma.trustDocument.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, title: true, description: true, access: true, fileName: true, fileSize: true } }),
    config.showPolicies
      ? prisma.policy.findMany({ where: { versions: { some: {} } }, orderBy: { title: 'asc' }, select: { title: true, versions: { orderBy: { version: 'desc' }, take: 1, select: { publishedAt: true } } } })
      : Promise.resolve([]),
    prisma.checkRun.count({ where: { isSample: true } }),
    prisma.checkRun.findFirst({ where: { isSample: false, status: { in: ['success', 'partial'] } }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
  ]);
  const subprocessors = config.showSubprocessors
    ? await prisma.vendor.findMany({ where: { status: 'active', subprocessor: true }, orderBy: { name: 'asc' }, select: { name: true, description: true, category: true, dataLocation: true } })
    : [];
  const faq = await prisma.answerLibraryEntry.findMany({ where: { isPublic: true }, orderBy: { question: 'asc' }, take: 50, select: { question: true, answer: true } });
  const practices = config.showPractices && sampleRuns === 0 && lastRun ? verifiedPractices(await latestCheckOutcomes()) : [];
  return {
    organization: settings.organizationName,
    headline: config.headline,
    description: config.description,
    contactEmail: config.contactEmail,
    ndaText: config.ndaText,
    frameworks: config.frameworks.map(f => ({ id: f.id, name: getFramework(f.id)?.name ?? f.id, status: f.status })),
    practices,
    practicesCheckedAt: practices.length ? lastRun!.startedAt.toISOString() : null,
    policies: policies.map(p => ({ title: p.title, updatedAt: p.versions[0]?.publishedAt.toISOString() ?? null })),
    documents,
    faq,
    subprocessors: subprocessors.map(x => ({ name: x.name, purpose: x.description || x.category, location: x.dataLocation })),
  };
}

export const hashAccessToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const newAccessToken = () => randomBytes(24).toString('base64url');

/** The approved request an access link belongs to, if it is still valid. */
export async function requestForToken(token: string | null | undefined) {
  if (!token || !/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const req = await prisma.trustRequest.findUnique({ where: { tokenHash: hashAccessToken(token) } });
  if (!req || req.status !== 'approved' || !req.expiresAt || req.expiresAt < new Date()) return null;
  return req;
}
