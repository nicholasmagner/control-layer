import type { CheckState, Facts } from './facts';

/**
 * Built-in answers to the questions that appear on almost every security
 * questionnaire (SIG Lite, CAIQ, VSA and customers' own). Each answer is
 * written from live facts: passing checks, published policies, sign-off,
 * frameworks, devices, vendors and risks. When the facts don't support a
 * confident answer, the answer says what's missing and is marked for review.
 */

export interface BuiltinAnswer {
  /** Short answer for Yes/No columns. */
  answer: 'Yes' | 'No' | 'Partially' | 'N/A' | null;
  text: string;
  /** Plain-language sources shown to the reviewer. */
  sources: string[];
  /** 0-1: how well the facts support this answer. Below 0.5 needs review. */
  confidence: number;
}

export interface BankEntry {
  key: string;
  topic: string;
  /** Typical phrasings, used for matching. The first is shown in the library. */
  questions: string[];
  /** Words that strongly indicate this topic. */
  keywords: string[];
  answer: (f: Facts) => BuiltinAnswer;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const policyLine = (f: Facts, slug: string) => {
  const p = f.policies.get(slug);
  return p ? `${p.title} (version ${p.version}, published ${day(p.publishedAt)})` : null;
};

/** Answer driven by automated checks, optionally backed by a policy. */
function fromChecks(f: Facts, ids: string[], yes: string, opts: { policy?: string; partial?: string; none?: string } = {}): BuiltinAnswer {
  const c: CheckState = f.check(ids);
  const pol = opts.policy ? policyLine(f, opts.policy) : null;
  const sources = [
    c.state !== 'unknown' ? `Automated checks: ${c.passed} passing, ${c.failed} failing${f.lastScan ? ` (last scan ${day(f.lastScan)})` : ''}` : null,
    pol ? `Policy: ${pol}` : null,
  ].filter((s): s is string => !!s);
  if (c.state === 'pass') return { answer: 'Yes', text: yes, sources, confidence: 0.9 };
  if (c.state === 'fail') {
    return {
      answer: 'Partially',
      text: opts.partial ?? `${yes} A small number of exceptions are being remediated.`,
      sources: [...sources, `Failing: ${c.failing.join(', ')}`],
      confidence: 0.55,
    };
  }
  if (pol) return { answer: 'Yes', text: yes, sources, confidence: 0.65 };
  return { answer: null, text: opts.none ?? yes, sources: ['No automated check or published policy covers this yet'], confidence: 0.3 };
}

/** Answer backed by a published policy. */
function fromPolicy(f: Facts, slug: string, yes: string, missing?: string): BuiltinAnswer {
  const pol = policyLine(f, slug);
  if (pol) return { answer: 'Yes', text: yes, sources: [`Policy: ${pol}`], confidence: 0.8 };
  return { answer: null, text: missing ?? yes, sources: ['The matching policy is not published yet (Policies)'], confidence: 0.3 };
}

const MFA = ['aws.root_mfa', 'aws.iam_user_mfa', 'gworkspace.mfa_enforced', 'gworkspace.user_mfa', 'm365.mfa_enforced', 'm365.user_mfa', 'github.org_2fa_required', 'github.member_2fa'];
const AT_REST = ['aws.s3_encryption', 'aws.ebs_encryption', 'aws.rds_encryption', 'devices.disk_encryption'];
const LOGGING = ['aws.cloudtrail_enabled', 'gcp.audit_logging', 'azure.activity_log_export', 'devices.audit_logging'];
const NETWORK = ['aws.sg_open_admin_ports', 'gcp.firewall_open_admin', 'azure.nsg_open_admin', 'devices.firewall', 'devices.remote_login'];
const OFFBOARD = ['gworkspace.former_employees', 'm365.former_employees', 'github.former_members', 'ad.former_employees', 'aws.iam_inactive_users', 'gworkspace.inactive_users', 'm365.inactive_users', 'ad.inactive_users'];

export const ANSWER_BANK: BankEntry[] = [
  // --- Governance -------------------------------------------------------------
  {
    key: 'infosec_policy', topic: 'Governance',
    questions: ['Do you have a documented information security policy?', 'Is there a formal information security program approved by management?', 'Provide a copy of your information security policy.'],
    keywords: ['information security policy', 'security program', 'isms', 'security policies'],
    answer: f => fromPolicy(f, 'information-security',
      `Yes. ${f.org} maintains a documented Information Security Policy approved by management, supported by topic-specific policies (${[...f.policies.values()].length} published), all reviewed at least annually.`,
      `${f.org} is finalizing its Information Security Policy.`),
  },
  {
    key: 'policy_review', topic: 'Governance',
    questions: ['Are security policies reviewed and updated at least annually?', 'How often are policies reviewed?'],
    keywords: ['policies reviewed', 'policy review', 'annually reviewed'],
    answer: f => {
      if (!f.policies.size) return { answer: null, text: 'Security policies are reviewed at least annually.', sources: ['No published policies yet'], confidence: 0.3 };
      const oldest = [...f.policies.values()].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime())[0];
      const current = Date.now() - oldest.publishedAt.getTime() < 366 * 86_400_000;
      return {
        answer: current ? 'Yes' : 'Partially',
        text: `Yes. Policies are reviewed and re-approved at least annually and after significant changes; each published version is retained with its approval date.`,
        sources: [`${f.policies.size} published policies; oldest current version ${day(oldest.publishedAt)}`], confidence: current ? 0.85 : 0.5,
      };
    },
  },
  {
    key: 'policy_ack', topic: 'Governance',
    questions: ['Do employees formally acknowledge security policies?', 'Are employees required to sign the acceptable use policy?', 'Do personnel acknowledge the code of conduct?'],
    keywords: ['acknowledge', 'acknowledgement', 'sign policies', 'attest', 'acceptable use'],
    answer: f => {
      const pct = f.people.acceptedPct;
      if (pct === null) return fromPolicy(f, 'acceptable-use', 'Yes. All personnel read and accept our security policies, including the Acceptable Use Policy and Code of Conduct, when they join and when the policies change.');
      return {
        answer: pct >= 95 ? 'Yes' : 'Partially',
        text: `Yes. All personnel read and electronically accept our security policies, including the Acceptable Use Policy and Code of Conduct, when they join and whenever a policy changes. Acceptance is recorded with the exact policy version.`,
        sources: [`Policy sign-off: ${pct}% of required acceptances from ${f.people.active} people`], confidence: pct >= 95 ? 0.9 : 0.55,
      };
    },
  },
  {
    key: 'security_owner', topic: 'Governance',
    questions: ['Who is responsible for information security?', 'Do you have a designated security officer or CISO?', 'Is there a dedicated security team?'],
    keywords: ['ciso', 'security officer', 'responsible for security', 'security team', 'security lead'],
    answer: f => {
      const owner = f.policies.get('information-security')?.owner;
      return owner
        ? { answer: 'Yes', text: `Yes. ${owner} is accountable for the information security program, with responsibilities defined in our Information Security Policy.`, sources: ['Information Security Policy owner'], confidence: 0.8 }
        : { answer: 'Yes', text: `Yes. A named security lead is accountable for the information security program, with responsibilities defined in our Information Security Policy. [Add the name and title.]`, sources: ['Set the owner on the Information Security Policy to fill this in'], confidence: 0.4 };
    },
  },
  {
    key: 'risk_assessment', topic: 'Governance',
    questions: ['Do you perform a formal risk assessment at least annually?', 'Do you maintain a risk register?', 'Describe your risk management process.'],
    keywords: ['risk assessment', 'risk register', 'risk management'],
    answer: f => {
      const recent = f.risks.lastAssessed && Date.now() - f.risks.lastAssessed.getTime() < 400 * 86_400_000;
      if (recent) return { answer: 'Yes', text: `Yes. We maintain a risk register in which each risk has an owner, likelihood, impact and treatment plan, and we review it at least annually (most recently ${day(f.risks.lastAssessed!)}).`, sources: [`Risk register: ${f.risks.open} open risks`], confidence: 0.9 };
      return fromPolicy(f, 'risk-management', 'Yes. A formal risk assessment is performed at least annually and after significant changes; risks are recorded in a risk register with owners, ratings and treatment plans.');
    },
  },
  {
    key: 'compliance_reports', topic: 'Compliance',
    questions: ['Do you have a SOC 2 Type II report?', 'Can you provide a copy of your most recent SOC 2 report?', 'Are you SOC 2 compliant?', 'Do you have any third-party security certifications or audit reports?'],
    keywords: ['soc 2', 'soc2', 'type ii', 'audit report', 'certification', 'attestation', 'iso 27001', 'certified'],
    answer: f => {
      const listed = f.frameworks.filter(x => x.status);
      const doc = f.trust.documents.find(d => /soc ?2|iso|audit|report/i.test(d));
      if (listed.length) {
        return {
          answer: 'Yes',
          text: `${listed.map(x => `${x.name}: ${x.status}`).join('. ')}.${doc ? ` Our ${doc} is available under NDA through our Trust Center.` : ''}`,
          sources: ['Trust Center compliance status', ...(doc ? [`Trust Center document: ${doc}`] : [])], confidence: 0.85,
        };
      }
      const soc2 = f.frameworks.find(x => x.id === 'SOC2');
      return {
        answer: 'Partially',
        text: `${f.org} operates its controls against ${f.frameworks.map(x => x.name).slice(0, 3).join(', ')}, monitored continuously.${soc2 ? ` Current SOC 2 control readiness is ${soc2.score}%.` : ''} [State your audit status, for example "SOC 2 Type II audit planned for Q3".]`,
        sources: ['No compliance status set in the Trust Center'], confidence: 0.35,
      };
    },
  },
  {
    key: 'pentest', topic: 'Compliance',
    questions: ['Do you conduct annual third-party penetration tests?', 'When was your last penetration test?', 'Can you share a penetration test summary?'],
    keywords: ['penetration test', 'pentest', 'pen test', 'ethical hacking'],
    answer: f => {
      const doc = f.trust.documents.find(d => /pen|penetration/i.test(d));
      return doc
        ? { answer: 'Yes', text: `Yes. An independent penetration test is performed at least annually and after major changes; findings are remediated within our vulnerability timelines. A summary (${doc}) is available under NDA in our Trust Center.`, sources: [`Trust Center document: ${doc}`], confidence: 0.85 }
        : fromPolicy(f, 'risk-management', 'Yes. An independent penetration test is performed at least annually and after major changes, and findings are remediated within our vulnerability management timelines. [Add the date of the most recent test.]');
    },
  },
  {
    key: 'continuous_monitoring', topic: 'Compliance',
    questions: ['How do you monitor compliance with your security controls?', 'Do you use automated compliance monitoring?'],
    keywords: ['monitor compliance', 'continuous monitoring', 'control monitoring', 'compliance monitoring'],
    answer: f => ({
      answer: f.connected.size ? 'Yes' : 'Partially',
      text: `Yes. Security controls are monitored continuously with automated checks of our ${[...f.connected].length ? 'cloud, identity, code and device ' : ''}configuration. Failing checks open findings that are tracked to resolution, and evidence is retained with tamper-evident, independently timestamped records.`,
      sources: [`${f.connected.size} connected integrations${f.lastScan ? `, last scan ${day(f.lastScan)}` : ''}`], confidence: f.connected.size ? 0.9 : 0.4,
    }),
  },
  // --- Access control ---------------------------------------------------------
  {
    key: 'mfa', topic: 'Access control',
    questions: ['Is multi-factor authentication (MFA) enforced for all users?', 'Do you require 2FA for access to production systems?', 'Is MFA required for administrative and remote access?'],
    keywords: ['mfa', 'multi-factor', 'multifactor', '2fa', 'two-factor', 'two factor', 'second factor'],
    answer: f => fromChecks(f, MFA,
      'Yes. Multi-factor authentication is enforced for all access to company email and identity, cloud consoles, and source code, and is required for all administrative access.',
      { policy: 'access-control', partial: 'Yes. Multi-factor authentication is required for company email and identity, cloud consoles and source code. A small number of accounts are being brought into compliance.' }),
  },
  {
    key: 'sso', topic: 'Access control',
    questions: ['Do you use single sign-on (SSO) for internal applications?', 'Is access to internal systems centrally managed?'],
    keywords: ['single sign-on', 'sso', 'centrally managed', 'identity provider', 'idp'],
    answer: f => {
      const idp = f.connected.has('gworkspace') ? 'Google Workspace' : f.connected.has('m365') ? 'Microsoft Entra ID' : f.connected.has('ad') ? 'Active Directory' : null;
      return idp
        ? { answer: 'Yes', text: `Yes. Workforce identities are managed centrally in ${idp}, with multi-factor authentication, and used to sign in to internal applications wherever supported.`, sources: [`Connected identity provider: ${idp}`], confidence: 0.75 }
        : { answer: null, text: 'Workforce identities are managed centrally in our identity provider. [Name it.]', sources: ['No identity provider connected (Integrations)'], confidence: 0.3 };
    },
  },
  {
    key: 'password_policy', topic: 'Access control',
    questions: ['Describe your password policy (length, complexity, rotation).', 'Are strong passwords enforced?', 'Do accounts lock after failed login attempts?'],
    keywords: ['password policy', 'password complexity', 'password length', 'lockout', 'failed login'],
    answer: f => fromChecks(f, ['aws.password_policy', 'ad.password_policy', 'devices.password_policy'],
      'Yes. Passwords must be at least 12 characters and unique, are stored in a company password manager, and accounts lock after repeated failed attempts. Multi-factor authentication is required in addition to passwords.',
      { policy: 'access-control' }),
  },
  {
    key: 'access_reviews', topic: 'Access control',
    questions: ['Do you perform periodic user access reviews?', 'How often are access rights reviewed?', 'Are privileged accounts reviewed quarterly?'],
    keywords: ['access review', 'user access review', 'access recertification', 'review access rights', 'entitlement review'],
    answer: f => {
      const last = f.accessReviews.lastCompleted;
      if (last && Date.now() - last.getTime() < 120 * 86_400_000) {
        return { answer: 'Yes', text: `Yes. System owners review user and administrator access at least quarterly; unneeded access is removed and the review is recorded. The most recent review was completed on ${day(last)}.`, sources: [`${f.accessReviews.count} completed access reviews`], confidence: 0.9 };
      }
      return fromPolicy(f, 'access-control', 'Yes. Access to production systems and customer data, and all administrative access, is reviewed at least quarterly; unneeded access is removed and each review is recorded.');
    },
  },
  {
    key: 'offboarding', topic: 'Access control',
    questions: ['How quickly is access revoked when an employee leaves?', 'Describe your offboarding process.', 'Are terminated users\' accounts disabled promptly?'],
    keywords: ['offboarding', 'termination', 'terminated', 'leaver', 'revoke access', 'deprovision'],
    answer: f => fromChecks(f, OFFBOARD,
      'All access is revoked within one business day of departure (immediately for involuntary terminations), company devices are returned and wiped, and shared credentials are rotated. Automated checks confirm that accounts of people who left are disabled.',
      { policy: 'human-resources-security' }),
  },
  {
    key: 'least_privilege', topic: 'Access control',
    questions: ['Is access granted based on least privilege?', 'How is administrative access restricted?', 'How many people have admin access?'],
    keywords: ['least privilege', 'role-based', 'rbac', 'privileged access', 'admin access', 'need to know'],
    answer: f => fromChecks(f, ['gworkspace.admin_count', 'm365.admin_count', 'ad.admin_count', 'github.default_permission', 'gcp.basic_roles', 'aws.root_access_keys'],
      'Yes. Access follows least privilege and role-based permissions, administrative access is limited to a small number of named individuals with approval, and access is reviewed regularly.',
      { policy: 'access-control' }),
  },
  // --- Data protection --------------------------------------------------------
  {
    key: 'encryption_rest', topic: 'Data protection',
    questions: ['Is customer data encrypted at rest?', 'What encryption do you use for data at rest?', 'Are laptops encrypted?'],
    keywords: ['encrypted at rest', 'encryption at rest', 'aes-256', 'aes 256', 'disk encryption', 'full disk', 'bitlocker', 'filevault', 'data at rest', 'encrypt', 'database encryption'],
    answer: f => fromChecks(f, AT_REST,
      'Yes. Customer data is encrypted at rest with AES-256 using our cloud providers\' managed encryption (databases, storage, disks and backups), and company laptops use full-disk encryption.',
      { policy: 'encryption' }),
  },
  {
    key: 'encryption_transit', topic: 'Data protection',
    questions: ['Is data encrypted in transit?', 'What TLS versions do you support?', 'Is all traffic over HTTPS?'],
    keywords: ['in transit', 'tls', 'https', 'ssl', 'transport encryption'],
    answer: f => fromChecks(f, ['azure.storage_secure_transfer', 'gcp.sql_ssl'],
      'Yes. All data in transit over public networks is encrypted with TLS 1.2 or higher; older protocols and weak ciphers are disabled.',
      { policy: 'encryption' }),
  },
  {
    key: 'key_management', topic: 'Data protection',
    questions: ['How are encryption keys managed?', 'Do you use a key management service?'],
    keywords: ['key management', 'kms', 'encryption keys', 'key rotation', 'hsm', 'key vault'],
    answer: f => fromChecks(f, ['azure.keyvault_protection'],
      'Encryption keys are managed in our cloud providers\' key management services, never stored in source code, access to keys is restricted and logged, and keys are rotated at least annually.',
      { policy: 'encryption' }),
  },
  {
    key: 'data_classification', topic: 'Data protection',
    questions: ['Do you have a data classification policy?', 'How is sensitive data identified and handled?'],
    keywords: ['data classification', 'classify data', 'sensitive data', 'confidential data'],
    answer: f => fromPolicy(f, 'data-classification', 'Yes. Data is classified as Restricted, Confidential, Internal or Public, with handling rules for each level; customer data is Restricted.'),
  },
  {
    key: 'data_retention', topic: 'Data protection',
    questions: ['What is your data retention policy?', 'How is customer data deleted at the end of a contract?', 'Do you securely dispose of data and media?'],
    keywords: ['retention', 'retained', 'retain customer data', 'delete', 'deletion', 'disposal', 'destroy', 'end of contract', 'contract termination', 'data return'],
    answer: f => fromPolicy(f, 'data-classification', 'Customer data is kept for the duration of the contract and deleted within 90 days after it ends (or returned on request), unless the law requires otherwise. Backups expire within 90 days, and storage media are securely wiped or destroyed before disposal.'),
  },
  {
    key: 'data_location', topic: 'Data protection',
    questions: ['Where is customer data stored and processed?', 'Which cloud provider and regions do you use?', 'Is data stored outside the EU / US?'],
    keywords: ['data location', 'data residency', 'region', 'hosted', 'hosting provider', 'cloud provider', 'data center', 'datacenter', 'stored'],
    answer: f => {
      const clouds = (['aws', 'gcp', 'azure'] as const).filter(p => f.connected.has(p)).map(p => ({ aws: 'Amazon Web Services', gcp: 'Google Cloud', azure: 'Microsoft Azure' })[p]);
      if (!clouds.length) return { answer: null, text: 'Customer data is hosted with [cloud provider] in [regions].', sources: ['No cloud account connected (Integrations)'], confidence: 0.25 };
      return {
        answer: null,
        text: `Customer data is hosted on ${clouds.join(' and ')}${f.awsRegions.length ? ` in ${f.awsRegions.join(', ')}` : ''}. Our providers' data centers are independently audited (SOC 2, ISO 27001).`,
        sources: ['Connected cloud accounts'], confidence: f.awsRegions.length || clouds.length ? 0.6 : 0.4,
      };
    },
  },
  {
    key: 'data_segregation', topic: 'Data protection',
    questions: ['How is customer data logically separated from other customers?', 'Is the environment multi-tenant?'],
    keywords: ['segregation', 'multi-tenant', 'multitenant', 'tenant isolation', 'logically separated', 'separate customers'],
    answer: () => ({ answer: null, text: 'Customer data is logically separated by tenant identifiers enforced in the application and database access layer, and access is restricted to authorized personnel. [Describe your architecture.]', sources: ['Architecture-specific: review and complete'], confidence: 0.3 }),
  },
  {
    key: 'public_storage', topic: 'Data protection',
    questions: ['Do you prevent data leakage through public storage?', 'Are storage buckets publicly accessible?'],
    keywords: ['public bucket', 'publicly accessible', 'data leakage', 'dlp', 'storage bucket', 's3 bucket'],
    answer: f => fromChecks(f, ['aws.s3_public', 'gcp.bucket_public', 'azure.storage_public_access', 'aws.rds_public', 'gcp.sql_public'],
      'Yes. Storage buckets and databases are not publicly accessible; this is verified continuously by automated checks.'),
  },
  {
    key: 'backups', topic: 'Business continuity',
    questions: ['Do you back up customer data?', 'How often are backups taken and tested?', 'Are backups encrypted and stored separately?'],
    keywords: ['backup', 'backups', 'restore', 'snapshot', 'point-in-time'],
    answer: f => fromChecks(f, ['aws.rds_backups', 'gcp.sql_backups'],
      'Yes. Production databases are backed up automatically at least daily with point-in-time recovery, backups are encrypted and kept separately from production, and restores are tested at least annually.',
      { policy: 'business-continuity' }),
  },
  {
    key: 'bcdr', topic: 'Business continuity',
    questions: ['Do you have a business continuity and disaster recovery plan?', 'What are your RTO and RPO?', 'Is the DR plan tested annually?'],
    keywords: ['business continuity', 'disaster recovery', 'bcp', 'drp', 'rto', 'rpo', 'outage', 'disaster', 'restore service', 'recovery time', 'recovery point'],
    answer: f => fromPolicy(f, 'business-continuity', 'Yes. We maintain a Business Continuity and Disaster Recovery Plan with defined recovery objectives (RTO 8 hours, RPO 24 hours for production), run across multiple availability zones, and test the plan, including a backup restore, at least annually.'),
  },
  // --- Operations -------------------------------------------------------------
  {
    key: 'logging', topic: 'Operations',
    questions: ['Do you log security events and administrative activity?', 'How long are logs retained?', 'Are audit logs protected from tampering?'],
    keywords: ['logging', 'audit log', 'logs', 'siem', 'log retention', 'event logs'],
    answer: f => fromChecks(f, LOGGING,
      'Yes. Administrative and security events in our cloud accounts, identity provider, code repositories and servers are logged centrally, protected from modification, and retained for at least 12 months.',
      { policy: 'logging-monitoring' }),
  },
  {
    key: 'monitoring', topic: 'Operations',
    questions: ['Do you monitor systems for security threats and anomalies?', 'Do you have 24/7 alerting?', 'Do you use intrusion detection?'],
    keywords: ['monitoring', 'alerting', 'intrusion detection', 'ids', 'threat detection', 'anomal'],
    answer: f => fromChecks(f, ['azure.defender_servers', 'aws.cloudtrail_enabled'],
      'Yes. We monitor for high-risk events (such as administrator sign-ins, disabled logging and network rule changes) with alerts to the on-call engineer, and continuously scan our cloud configuration for misconfigurations.',
      { policy: 'logging-monitoring' }),
  },
  {
    key: 'vuln_mgmt', topic: 'Operations',
    questions: ['Describe your vulnerability management program.', 'How quickly are critical vulnerabilities patched?', 'Do you scan for vulnerabilities?'],
    keywords: ['vulnerability', 'vulnerabilities', 'patch', 'patching', 'cve', 'scanning'],
    answer: f => fromChecks(f, ['devices.os_updates', 'github.dependabot_alerts', 'github.secret_scanning'],
      'Yes. Systems and dependencies are scanned continuously; security patches are applied within 7 days for critical, 30 days for high and 90 days for medium severity, and an independent penetration test is performed annually.',
      { policy: 'risk-management' }),
  },
  {
    key: 'malware', topic: 'Operations',
    questions: ['Is anti-malware / endpoint protection deployed on all endpoints?', 'Do you use EDR?'],
    keywords: ['antivirus', 'anti-virus', 'malware', 'anti-malware', 'edr', 'endpoint protection', 'endpoint detection'],
    answer: f => fromChecks(f, ['devices.malware_protection'],
      'Yes. All company workstations run anti-malware with real-time protection, kept up to date automatically, and their status is monitored centrally.',
      { policy: 'asset-management' }),
  },
  {
    key: 'endpoint', topic: 'Operations',
    questions: ['How are employee laptops secured?', 'Do you use MDM?', 'Do endpoints have screen lock and encryption enforced?'],
    keywords: ['laptop', 'endpoint', 'workstation', 'mdm', 'device management', 'screen lock'],
    answer: f => {
      const base = fromChecks(f, ['devices.disk_encryption', 'devices.screen_lock', 'devices.firewall', 'devices.os_updates'],
        'Company laptops are required to have full-disk encryption, an automatic screen lock of 15 minutes or less, a firewall, automatic updates and anti-malware. Compliance is monitored with an endpoint agent that reports daily.',
        { policy: 'asset-management' });
      return f.devices.workstations ? { ...base, sources: [...base.sources, `${f.devices.workstations} workstations reporting`] } : base;
    },
  },
  {
    key: 'asset_inventory', topic: 'Operations',
    questions: ['Do you maintain an inventory of hardware and software assets?', 'Is there an asset inventory?'],
    keywords: ['asset inventory', 'inventory of assets', 'asset management', 'cmdb'],
    answer: f => ({
      ...fromPolicy(f, 'asset-management', 'Yes. We maintain an inventory of company devices, cloud accounts and production systems, each with an owner; device and cloud inventories are updated automatically.'),
      ...(f.devices.total ? { sources: [`${f.devices.total} devices and ${f.connected.size} integrations tracked automatically`], confidence: 0.85, answer: 'Yes' as const } : {}),
    }),
  },
  {
    key: 'network_security', topic: 'Operations',
    questions: ['How is your network protected?', 'Are firewalls in place?', 'Is administrative access (SSH/RDP) restricted?'],
    keywords: ['firewall', 'network security', 'ssh', 'rdp', 'security group', 'network segmentation', 'vpn', 'remote access'],
    answer: f => fromChecks(f, NETWORK,
      'Yes. Network access is restricted with cloud security groups and host firewalls; administrative ports (SSH, RDP) are not exposed to the internet, remote logins require keys or Network Level Authentication, and administrative access uses encrypted channels.'),
  },
  {
    key: 'time_sync', topic: 'Operations',
    questions: ['Are system clocks synchronized?'],
    keywords: ['clock', 'ntp', 'time synchronization', 'time sync'],
    answer: f => fromPolicy(f, 'logging-monitoring', 'Yes. Systems synchronize their clocks to trusted time sources so that logs can be correlated.'),
  },
  // --- Software development ---------------------------------------------------
  {
    key: 'change_mgmt', topic: 'Software development',
    questions: ['Describe your change management process.', 'Are code changes peer reviewed before deployment?', 'Is branch protection enabled?'],
    keywords: ['change management', 'code review', 'peer review', 'pull request', 'branch protection', 'deployment approval', 'code changes', 'second engineer', 'four eyes'],
    answer: f => fromChecks(f, ['github.branch_protection'],
      'Yes. All production code changes go through pull requests that require approval from someone other than the author, automated tests must pass, and deployments use an automated pipeline. Emergency changes are reviewed within two business days.',
      { policy: 'change-management' }),
  },
  {
    key: 'sdlc', topic: 'Software development',
    questions: ['Do you follow a secure software development life cycle (SDLC)?', 'Do you scan code and dependencies for vulnerabilities?', 'Do you prevent secrets in source code?'],
    keywords: ['sdlc', 'secure development', 'secure coding', 'static analysis', 'sast', 'dependency scanning', 'secrets in code', 'owasp'],
    answer: f => fromChecks(f, ['github.dependabot_alerts', 'github.secret_scanning', 'github.branch_protection'],
      'Yes. Security is built into development: peer review on every change, dependency vulnerability alerts, secret scanning on repositories, and fixes within defined timelines.',
      { policy: 'change-management' }),
  },
  {
    key: 'environments', topic: 'Software development',
    questions: ['Are development, test and production environments separated?', 'Is production data used in testing?'],
    keywords: ['production data', 'test environment', 'separation of environments', 'staging', 'non-production'],
    answer: f => fromPolicy(f, 'change-management', 'Yes. Development, test and production environments are separated, access to production is restricted, and production customer data is not used in development or testing.'),
  },
  // --- People -----------------------------------------------------------------
  {
    key: 'background_checks', topic: 'People',
    questions: ['Do you perform background checks on employees?', 'Are contractors screened before access?'],
    keywords: ['background check', 'screening', 'criminal record', 'pre-employment'],
    answer: f => fromPolicy(f, 'human-resources-security', 'Yes. Background checks are performed for employees and contractors with access to production systems or customer data, where permitted by law.'),
  },
  {
    key: 'training', topic: 'People',
    questions: ['Do employees receive security awareness training?', 'How often is security training conducted?', 'Do you run phishing simulations?'],
    keywords: ['training', 'awareness', 'phishing', 'security awareness'],
    answer: f => fromPolicy(f, 'human-resources-security', 'Yes. All personnel complete security awareness training when they join and at least annually, covering phishing, passwords and MFA, data handling and incident reporting.'),
  },
  {
    key: 'nda', topic: 'People',
    questions: ['Do employees sign confidentiality agreements?', 'Are NDAs in place with staff and contractors?'],
    keywords: ['confidentiality agreement', 'nda', 'non-disclosure'],
    answer: f => fromPolicy(f, 'human-resources-security', 'Yes. Employment and contractor agreements include confidentiality obligations that continue after the relationship ends.'),
  },
  {
    key: 'code_of_conduct', topic: 'People',
    questions: ['Do you have a code of conduct?', 'Is there a disciplinary process for policy violations?'],
    keywords: ['code of conduct', 'disciplinary', 'ethics', 'whistleblow'],
    answer: f => fromPolicy(f, 'code-of-conduct', 'Yes. Everyone accepts our Code of Conduct, and violations of security policies are handled through a formal disciplinary process.'),
  },
  // --- Incidents --------------------------------------------------------------
  {
    key: 'incident_response', topic: 'Incident response',
    questions: ['Do you have a documented incident response plan?', 'Is the incident response plan tested?', 'Describe how you handle security incidents.'],
    keywords: ['incident response', 'security incident', 'incident management', 'tabletop'],
    answer: f => fromPolicy(f, 'incident-response', 'Yes. We maintain a documented Incident Response Plan with severity levels, roles and steps to contain, investigate, recover and learn from incidents, and test it at least annually with a tabletop exercise.'),
  },
  {
    key: 'breach_notification', topic: 'Incident response',
    questions: ['Will you notify us of a security breach affecting our data?', 'Within what timeframe will customers be notified of a breach?', 'Have you had any data breaches in the last 3 years?'],
    keywords: ['breach', 'notify', 'notification', 'data breach', '72 hours'],
    answer: f => ({
      ...fromPolicy(f, 'incident-response', 'Yes. Affected customers are notified without undue delay, and within the timeframe in their contract or required by law (for example within 72 hours where applicable), with details of the incident and our response. [Confirm whether you have had any breaches.]'),
      confidence: f.policies.has('incident-response') ? 0.6 : 0.3,
    }),
  },
  // --- Vendors ----------------------------------------------------------------
  {
    key: 'vendor_mgmt', topic: 'Third parties',
    questions: ['How do you assess the security of your vendors and subprocessors?', 'Do you have a third-party risk management program?', 'Are vendors reviewed annually?'],
    keywords: ['vendor', 'vendors', 'third party', 'third-party', 'supplier', 'subprocessor', 'sub-processor', 'tprm'],
    answer: f => {
      if (f.vendors.total) {
        return {
          answer: (f.vendors.reviewedPct ?? 0) >= 80 ? 'Yes' : 'Partially',
          text: `Yes. We keep an inventory of vendors with their data access and risk tier, review each vendor's security (SOC 2 / ISO 27001 reports or questionnaires) before onboarding and at least annually for high-risk vendors, and require data protection terms in contracts.`,
          sources: [`${f.vendors.total} vendors tracked; ${f.vendors.reviewedPct ?? 0}% reviewed in the last year`], confidence: (f.vendors.reviewedPct ?? 0) >= 80 ? 0.9 : 0.6,
        };
      }
      return fromPolicy(f, 'vendor-management', 'Yes. Vendors that handle company or customer data are risk-rated, their security is reviewed before onboarding and annually for high-risk vendors, and contracts include confidentiality, data protection and breach notification terms.');
    },
  },
  // --- Privacy ----------------------------------------------------------------
  {
    key: 'privacy_program', topic: 'Privacy',
    questions: ['Are you GDPR compliant?', 'Do you have a privacy policy?', 'Will you sign a data processing agreement (DPA)?'],
    keywords: ['gdpr', 'privacy', 'personal data', 'dpa', 'data processing agreement', 'ccpa'],
    answer: f => fromPolicy(f, 'privacy-data-protection', 'Yes. We process personal data in line with the GDPR and other applicable privacy laws: a documented lawful basis, records of processing, a published privacy notice, data processing agreements with customers and subprocessors, and standard contractual clauses for international transfers.'),
  },
  {
    key: 'dsar', topic: 'Privacy',
    questions: ['How do you handle data subject access requests?', 'Can individuals request deletion of their data?'],
    keywords: ['data subject', 'dsar', 'access request', 'right to be forgotten', 'erasure', 'deletion request'],
    answer: f => fromPolicy(f, 'privacy-data-protection', 'Requests to access, correct, delete or export personal data are verified, logged and answered within one month, and we assist customers with requests about data we process on their behalf.'),
  },
  {
    key: 'hipaa', topic: 'Privacy',
    questions: ['Are you HIPAA compliant?', 'Will you sign a Business Associate Agreement (BAA)?', 'How do you protect PHI?'],
    keywords: ['hipaa', 'phi', 'baa', 'business associate', 'health information', 'ephi'],
    answer: f => {
      const h = f.frameworks.find(x => x.id === 'HIPAA');
      if (!h) return { answer: 'N/A', text: `${f.org} does not process protected health information. [Change this if you do.]`, sources: ['HIPAA is not among your selected frameworks'], confidence: 0.4 };
      return { answer: 'Yes', text: `Yes. We implement the HIPAA Security Rule's administrative, physical and technical safeguards for electronic protected health information, and sign Business Associate Agreements with customers who require them.${h.status ? ` Status: ${h.status}.` : ''}`, sources: [`HIPAA control readiness ${h.score}%`], confidence: h.score >= 70 ? 0.75 : 0.5 };
    },
  },
  // --- AI ---------------------------------------------------------------------
  {
    key: 'ai_use', topic: 'AI',
    questions: ['Do you use artificial intelligence or machine learning in your product or services?', 'How do you govern the use of AI?', 'Do you have an AI policy?'],
    keywords: ['artificial intelligence', 'ai', 'machine learning', 'ml', 'llm', 'generative', 'large language model', 'chatgpt'],
    answer: f => fromPolicy(f, 'responsible-ai', `We govern AI under our Responsible AI Policy: AI systems are inventoried with an owner and intended use, assessed for impact before use, tested and monitored, and outputs that affect people are reviewed by a person. Personnel may only use approved AI tools, under our AI Acceptable Use Policy. [Describe any AI features in your product.]`,
      'Use of AI tools is limited to approved tools. [Describe how you use and govern AI.]'),
  },
  {
    key: 'ai_training_data', topic: 'AI',
    questions: ['Is our data used to train AI models?', 'Do your AI vendors train on customer data?'],
    keywords: ['train', 'training data', 'model training', 'fine-tune', 'fine tune'],
    answer: f => fromPolicy(f, 'responsible-ai', 'No. Customer data is not used to train AI models unless the customer agrees in writing, and our AI vendors are contractually prohibited from training on our or our customers\' data.'),
  },
  // --- Physical & other -------------------------------------------------------
  {
    key: 'physical', topic: 'Physical security',
    questions: ['Describe physical security controls for your data centers and offices.', 'Who has physical access to servers?'],
    keywords: ['physical security', 'physical access', 'data center', 'office', 'badge', 'cctv'],
    answer: f => fromPolicy(f, 'asset-management', 'Production systems run in our cloud providers\' data centers, whose physical security is independently audited (SOC 2, ISO 27001). Our offices restrict entry to authorized people, escort visitors and keep a visitor log.'),
  },
  {
    key: 'insurance', topic: 'Other',
    questions: ['Do you carry cyber liability insurance?', 'What are your insurance coverage limits?'],
    keywords: ['insurance', 'cyber insurance', 'liability coverage'],
    answer: () => ({ answer: null, text: '[Confirm whether you carry cyber liability insurance, and the coverage amount.]', sources: ['Not tracked in ControlLayer'], confidence: 0.1 }),
  },
  {
    key: 'trust_center', topic: 'Other',
    questions: ['Where can we find more information about your security?', 'Do you have a trust center or security page?'],
    keywords: ['trust center', 'security page', 'security documentation', 'more information'],
    answer: f => f.trust.enabled
      ? { answer: 'Yes', text: 'Our Trust Center describes our security practices, compliance status and policies, and lets you request our audit reports and security documents under NDA.', sources: ['Trust Center is published'], confidence: 0.9 }
      : { answer: null, text: 'Security documentation is available on request under NDA.', sources: ['Trust Center is not published'], confidence: 0.4 },
  },
  {
    key: 'evidence_integrity', topic: 'Other',
    questions: ['How do you ensure audit evidence and logs cannot be altered?'],
    keywords: ['tamper', 'integrity of logs', 'immutable', 'evidence integrity'],
    answer: f => ({
      answer: 'Yes',
      text: `Compliance evidence is fingerprinted with SHA-256 and linked in a hash chain when collected${f.timestamps ? ', and the chain is timestamped by an independent RFC 3161 time-stamp authority' : ''}, so any later change is detectable. Cloud audit logs are protected from modification.`,
      sources: ['Evidence chain', ...(f.timestamps ? ['Independent timestamps on'] : [])], confidence: 0.85,
    }),
  },
];
