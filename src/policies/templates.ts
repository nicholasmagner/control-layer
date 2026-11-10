/**
 * Policy templates for small companies. Written to be adopted as-is or edited,
 * covering what SOC 2, CMMC Level 1 and PCI DSS auditors expect to see.
 * Placeholders: {{organization}}, {{owner}}, {{effective_date}}, {{review_period}}.
 * They are starting points, not legal advice: adapt them to how you work.
 */

export interface PolicyTemplate {
  slug: string;
  title: string;
  summary: string;
  /** Control keys "FRAMEWORK:ID" this policy supports. */
  controls: string[];
  reviewIntervalDays: number;
  requiresSignoff: boolean;
  body: string;
}

const header = (title: string) => `# ${title}

| | |
| :--- | :--- |
| Organization | {{organization}} |
| Policy owner | {{owner}} |
| Effective date | {{effective_date}} |
| Review | {{review_period}} |
`;

const enforcement = `
## Exceptions
Exceptions must be requested in writing, approved by the policy owner, documented with the reason and any compensating measures, and reviewed at least annually.

## Enforcement
Violations of this policy may result in disciplinary action, up to and including termination of employment or contract, and may be reported to authorities where required by law.
`;

export const POLICY_TEMPLATES: PolicyTemplate[] = [
  {
    slug: 'information-security',
    title: 'Information Security Policy',
    summary: 'The umbrella policy: why security matters here, who is responsible, and which other policies apply.',
    controls: ['SOC2:CC1.1', 'SOC2:CC1.3', 'SOC2:CC2.2', 'SOC2:CC5.3', 'PCI:12.1.1'],
    reviewIntervalDays: 365,
    requiresSignoff: true,
    body: `${header('Information Security Policy')}
## Purpose
{{organization}} protects the confidentiality, integrity and availability of the information entrusted to us by customers, employees and partners. This policy sets the direction for our security program and is supported by the more specific policies listed below.

## Scope
This policy applies to all employees, contractors and other people with access to {{organization}} systems or data ("personnel"), and to all systems, networks, devices and data we own or operate, including cloud services.

## Roles and responsibilities
- **Leadership** approves this policy, provides resources for the security program and reviews its effectiveness at least annually.
- **The policy owner ({{owner}})** maintains the security program, coordinates risk assessments and audits, and reports on security to leadership.
- **Managers** make sure their teams complete security training and follow these policies, and request and remove access for their reports.
- **All personnel** follow these policies, protect the data and devices they use, and report suspected security incidents immediately.

## Security objectives
1. Protect customer data from unauthorized access, change or loss.
2. Keep our services available in line with our commitments.
3. Meet our legal, regulatory and contractual obligations.
4. Find and fix security weaknesses before they cause harm.

## Program elements
{{organization}} maintains the following policies, which all personnel must follow where they apply:
Acceptable Use, Access Control, Change Management, Incident Response, Business Continuity and Disaster Recovery, Data Classification and Retention, Encryption, Vendor Management, Risk Management, Human Resources Security, Code of Conduct, Asset and Device Management, and Logging and Monitoring.

## Monitoring and review
Compliance with these policies is monitored continuously through automated checks and periodic reviews. Policies are reviewed at least annually and after significant changes to the business or technology, and changes are approved by the policy owner.

## Reporting concerns
Report suspected security incidents or policy violations to {{owner}} or through the internal security channel. Reports made in good faith will never lead to retaliation.
${enforcement}`,
  },
  {
    slug: 'acceptable-use',
    title: 'Acceptable Use Policy',
    summary: 'What personnel may and may not do with company systems, devices, accounts and data.',
    controls: ['SOC2:CC1.1', 'SOC2:CC2.2', 'SOC2:CC6.8', 'CMMC:AC.L1-3.1.20', 'PCI:12.1.1'],
    reviewIntervalDays: 365,
    requiresSignoff: true,
    body: `${header('Acceptable Use Policy')}
## Purpose
To make clear how {{organization}} systems, devices and data may be used, so that everyone can work productively without creating unnecessary risk.

## General use
- Company systems and data are provided for business purposes. Limited personal use is acceptable if it does not interfere with work, break the law or put company data at risk.
- Personnel are responsible for activity performed with their accounts.
- Company data may only be stored in approved systems. Do not move it to personal email, personal cloud storage or unapproved tools.

## Accounts and passwords
- Never share accounts or passwords. Use the company password manager to store credentials.
- Use multi-factor authentication (MFA) wherever it is available, and always for email, identity, cloud and code repositories.
- Report lost devices, suspected phishing and any request to share credentials immediately.

## Devices
- Work devices must have disk encryption, a screen lock of 10 minutes or less, automatic updates and endpoint protection enabled.
- Do not disable or bypass security software or controls.
- Lock your screen when you step away. Do not leave devices unattended in public places.

## Prohibited activities
- Accessing systems or data you are not authorized to use, or trying to bypass access controls.
- Installing pirated, unlicensed or untrusted software.
- Using company systems to harass others or to create, store or share illegal or offensive content.
- Connecting unknown devices (such as USB drives) to work devices without approval.
- Sharing confidential information outside the company without authorization.

## AI and external tools
Only use AI services and other external tools approved by {{organization}}, and never paste confidential customer data, credentials or secrets into tools that are not approved for that data.

## Monitoring
{{organization}} may monitor the use of company systems to protect security, within the limits of applicable law. Personnel should have no expectation of privacy in company systems beyond what the law provides.
${enforcement}`,
  },
  {
    slug: 'access-control',
    title: 'Access Control Policy',
    summary: 'How access is requested, approved, reviewed and removed, with MFA and least privilege.',
    controls: ['SOC2:CC6.1', 'SOC2:CC6.2', 'SOC2:CC6.3', 'CMMC:AC.L1-3.1.1', 'CMMC:AC.L1-3.1.2', 'CMMC:IA.L1-3.5.1', 'CMMC:IA.L1-3.5.2', 'PCI:7.2.1', 'PCI:7.2.4', 'PCI:8.2.6', 'PCI:8.3.6', 'PCI:8.4.2'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Access Control Policy')}
## Purpose
To make sure only authorized people and systems can access {{organization}} systems and data, and only to the extent they need.

## Principles
- **Least privilege:** access is limited to what a role requires.
- **Unique identities:** every person and service has its own account. Shared accounts are not allowed, except documented break-glass accounts.
- **Separation of duties:** no single person should be able to make and approve high-risk changes alone.

## Granting access
1. Access is requested by the person's manager (or the person, with manager approval) through the ticketing system or a documented request.
2. The system owner approves the request before access is granted.
3. Administrative access requires additional approval from {{owner}} and is limited to people who need it to do their jobs.

## Authentication
- Multi-factor authentication is required for all access to email, identity providers, cloud consoles, code repositories and any system containing customer data.
- Passwords must be at least 12 characters, unique, and stored in the company password manager. Default passwords must be changed before systems are used.
- Service account credentials and API keys are stored in a secrets manager, never in source code, and rotated at least every 90 days or when someone with access leaves.
- The cloud root / global administrator accounts are protected with hardware-backed MFA, have no access keys, and are used only for tasks that require them.

## Access reviews
System owners review who has access to production systems and customer data at least quarterly, and administrative access at least quarterly. Unneeded access is removed promptly and the review is recorded.

## Removing access
- When someone leaves, all their access is removed within one business day (immediately for involuntary departures).
- When someone changes roles, access they no longer need is removed within five business days.
- Accounts unused for 90 days are disabled.
${enforcement}`,
  },
  {
    slug: 'change-management',
    title: 'Change Management Policy',
    summary: 'How code and infrastructure changes are reviewed, tested, approved and deployed.',
    controls: ['SOC2:CC8.1', 'SOC2:CC5.2', 'PCI:6.5.1', 'PCI:2.2.1'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Change Management Policy')}
## Purpose
To make sure changes to production software and infrastructure are planned, reviewed, tested and traceable, so they don't introduce security problems or outages.

## Scope
All changes to production application code, infrastructure, configuration, databases and security settings.

## Requirements
1. **Version control.** All application code and infrastructure-as-code lives in the company's source control system.
2. **Peer review.** Every change to the main branch is made through a pull request and approved by at least one person other than the author. Branch protection enforces this.
3. **Testing.** Automated tests run on every pull request. Changes are merged only when tests pass, unless an exception is documented.
4. **Traceability.** Pull requests describe what changed and why, and link to a ticket where one exists.
5. **Deployment.** Production deployments use an automated pipeline. Direct changes in production are allowed only in emergencies.
6. **Secrets.** Secrets are never committed to source control. Secret scanning is enabled on repositories.
7. **Dependencies.** Third-party dependencies are kept up to date, and known vulnerabilities are fixed in line with the timelines in the Risk Management Policy.

## Emergency changes
Urgent changes needed to restore service or fix a critical vulnerability may be deployed before review. They must be documented and reviewed by a second person within two business days.

## Infrastructure changes
Changes to cloud networking, identity and access settings, encryption and logging follow the same review process and are recorded in the cloud provider's audit log.
${enforcement}`,
  },
  {
    slug: 'incident-response',
    title: 'Incident Response Plan',
    summary: 'How security incidents are reported, triaged, contained, communicated and learned from.',
    controls: ['SOC2:CC7.3', 'SOC2:CC7.4', 'SOC2:CC7.5', 'SOC2:CC2.3', 'PCI:12.10.1'],
    reviewIntervalDays: 365,
    requiresSignoff: true,
    body: `${header('Incident Response Plan')}
## Purpose
To respond to security incidents quickly and consistently, limit their impact, meet notification obligations and learn from them.

## What is an incident?
Any event that threatens the confidentiality, integrity or availability of {{organization}} systems or data. Examples: a lost laptop, a phishing email that was clicked, leaked credentials, malware, unauthorized access, or an outage caused by an attack.

## Everyone's responsibility
Report suspected incidents immediately to {{owner}} or the security channel, even if you are unsure. Do not try to investigate on your own or delete evidence.

## Severity levels
| Level | Description | Response |
| :--- | :--- | :--- |
| Critical | Confirmed breach of customer data, or a major service outage | Immediately, around the clock |
| High | Likely compromise of a system or account, no confirmed data loss | Within 4 hours |
| Medium | Contained security event with limited impact | Within 1 business day |
| Low | Policy violation or suspicious activity with no impact | Within 5 business days |

## Response steps
1. **Identify and record.** Open an incident record with time, reporter, systems affected and initial severity. Name an incident lead.
2. **Contain.** Limit the damage: disable compromised accounts, rotate credentials, isolate affected systems.
3. **Investigate.** Determine what happened, what data and customers are affected, and the root cause. Preserve logs and evidence.
4. **Eradicate and recover.** Remove the cause, restore systems from known-good state, and confirm they work normally.
5. **Communicate.** Leadership decides on customer, partner and regulator notifications. Affected customers are notified without undue delay and within contractual and legal deadlines (for example within 72 hours where required).
6. **Learn.** Within two weeks of closing a High or Critical incident, hold a blameless post-incident review and track the follow-up actions to completion.

## Testing
This plan is tested at least once a year with a tabletop exercise, and updated with what was learned.
`,
  },
  {
    slug: 'business-continuity',
    title: 'Business Continuity and Disaster Recovery Plan',
    summary: 'Backups, recovery objectives and how the company keeps operating through disruptions.',
    controls: ['SOC2:CC9.1', 'SOC2:A1.1', 'SOC2:A1.2', 'SOC2:A1.3'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Business Continuity and Disaster Recovery Plan')}
## Purpose
To keep critical services running, or restore them quickly, after an outage, disaster or other disruption.

## Recovery objectives
| System | Recovery time objective (RTO) | Recovery point objective (RPO) |
| :--- | :--- | :--- |
| Customer-facing application | 8 hours | 24 hours |
| Production database | 8 hours | 24 hours |
| Internal tools | 3 business days | 1 week |

Adjust these to your commitments to customers.

## Backups
- Production databases are backed up automatically at least daily, and backups are kept for at least 7 days (30 days recommended).
- Backups are encrypted and stored separately from the production systems they protect (for example in another region or account).
- Restores from backup are tested at least once a year, and the result is recorded.

## Resilience
- Production systems run across more than one availability zone where the service allows it.
- Capacity and uptime are monitored, with alerts sent to the on-call person.
- Infrastructure is defined as code so it can be recreated.

## Disaster recovery steps
1. The incident lead declares a disaster and notifies leadership.
2. Assess which systems are affected and the expected duration.
3. Restore systems in priority order using the latest good backups and infrastructure code.
4. Verify data integrity and service health before reopening to customers.
5. Communicate status to customers at regular intervals.
6. Hold a post-incident review and update this plan.

## Business continuity
Personnel can work remotely using company-managed devices and cloud services. Contact details for key people and vendors are kept up to date and available offline.

## Testing
This plan, including a backup restore, is tested at least annually.
`,
  },
  {
    slug: 'data-classification',
    title: 'Data Classification and Retention Policy',
    summary: 'How data is classified, handled, kept and securely deleted.',
    controls: ['SOC2:C1.1', 'SOC2:C1.2', 'SOC2:CC6.5', 'SOC2:CC6.7', 'CMMC:MP.L1-3.8.3', 'CMMC:AC.L1-3.1.22', 'PCI:3.5.1', 'PCI:9.4.7'],
    reviewIntervalDays: 365,
    requiresSignoff: true,
    body: `${header('Data Classification and Retention Policy')}
## Purpose
To make sure data is protected according to its sensitivity, kept only as long as needed, and destroyed securely.

## Classification levels
| Level | Examples | Handling |
| :--- | :--- | :--- |
| **Restricted** | Customer data, payment data, credentials, encryption keys, personal data | Encrypted at rest and in transit; access limited to people who need it; never shared externally without approval and an agreement |
| **Confidential** | Contracts, financials, internal plans, source code | Access limited to personnel; shared externally only under NDA |
| **Internal** | Internal procedures, most internal messages | Personnel only |
| **Public** | Marketing material, published documentation | No restrictions |

When unsure, treat data as Confidential.

## Handling rules
- Restricted data is stored only in approved production systems, never on personal devices or in personal accounts.
- Restricted and Confidential data is sent only over encrypted connections.
- Public sharing (websites, public storage buckets) must be reviewed to make sure no non-public data is exposed.

## Retention
| Data | Kept for |
| :--- | :--- |
| Customer data | Duration of the contract, then deleted within 90 days unless the customer asks otherwise or the law requires longer |
| Backups | Up to 90 days |
| Security and audit logs | At least 12 months |
| Employee records | As required by law |

## Disposal
- Data is deleted when no longer needed, following the retention schedule.
- Devices and storage media are securely wiped or physically destroyed before disposal or reuse, and the disposal is recorded.
- Cloud providers' certified media destruction covers their hardware.
`,
  },
  {
    slug: 'encryption',
    title: 'Encryption and Key Management Policy',
    summary: 'Where encryption is required and how keys are managed.',
    controls: ['SOC2:CC6.1', 'SOC2:CC6.7', 'SOC2:C1.1', 'PCI:3.5.1', 'PCI:3.7.1', 'PCI:4.2.1', 'PCI:2.2.7'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Encryption and Key Management Policy')}
## Purpose
To protect data with strong encryption and to manage encryption keys securely.

## Encryption at rest
- Databases, storage buckets, disks and backups containing Confidential or Restricted data are encrypted with AES-256 or an equivalent algorithm, using the cloud provider's managed encryption at a minimum.
- Laptops and workstations use full-disk encryption.

## Encryption in transit
- All external connections use TLS 1.2 or newer. Older protocols and weak cipher suites are disabled.
- Internal connections carrying Restricted data are also encrypted.
- Administrative access to systems uses encrypted channels (for example HTTPS, SSH or a cloud provider's session manager).

## Key management
- Keys are stored in a managed key service (for example AWS KMS, Google Cloud KMS or Azure Key Vault) or a secrets manager, never in source code or configuration files.
- Access to keys follows least privilege and is logged.
- Keys are rotated at least annually, and immediately if compromise is suspected.
- Key vaults have soft delete and purge protection enabled where available.

## Certificates
TLS certificates come from trusted authorities, are renewed automatically where possible, and are monitored for expiry.
`,
  },
  {
    slug: 'vendor-management',
    title: 'Vendor Management Policy',
    summary: 'How vendors that handle company or customer data are assessed and monitored.',
    controls: ['SOC2:CC9.2', 'SOC2:CC6.4', 'PCI:12.8.1'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Vendor Management Policy')}
## Purpose
To manage the security risks that come from vendors and service providers who access, store or process {{organization}} or customer data.

## Vendor inventory
{{owner}} maintains a list of vendors with: what they do for us, what data they can access, the business owner, the risk level, and the date of the last review.

## Risk levels
- **High:** stores or processes Restricted data, or is critical to running our service (for example cloud hosting, payment processing).
- **Medium:** accesses Confidential data or internal systems.
- **Low:** no access to non-public data.

## Before signing a new vendor
1. The business owner records the vendor and the data it will access.
2. For High and Medium vendors, review their security: a current SOC 2 Type II or ISO 27001 report, or a security questionnaire.
3. Make sure the contract covers confidentiality, data protection, breach notification and, where personal data is involved, a data processing agreement.
4. {{owner}} approves High-risk vendors.

## Ongoing monitoring
- High-risk vendors are reviewed every year, including their latest audit report and any exceptions in it.
- Medium-risk vendors are reviewed every two years.
- When a vendor is no longer used, their access is removed and data returned or deleted.
`,
  },
  {
    slug: 'risk-management',
    title: 'Risk Management Policy',
    summary: 'How risks are identified, rated, treated and reviewed, including vulnerabilities.',
    controls: ['SOC2:CC3.1', 'SOC2:CC3.2', 'SOC2:CC3.3', 'SOC2:CC3.4', 'SOC2:CC5.1', 'SOC2:CC4.1', 'SOC2:CC4.2', 'SOC2:CC7.1', 'CMMC:SI.L1-3.14.1', 'PCI:6.3.3', 'PCI:11.3.1', 'PCI:11.4.1'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Risk Management Policy')}
## Purpose
To find, assess and manage the risks that could prevent {{organization}} from meeting its security objectives.

## Risk assessment
- A risk assessment is performed at least annually and after significant changes (new products, major vendors, acquisitions, new regulations).
- Each risk is recorded in the risk register with: description, owner, likelihood (1–5), impact (1–5), score, treatment and status.
- The assessment considers fraud, insider threats, vendors, technology changes and the threats relevant to our industry.

## Risk treatment
For each risk, the owner chooses to **reduce** it (add controls), **avoid** it (stop the activity), **transfer** it (insurance, contracts) or **accept** it. Accepting a High risk requires leadership approval, which is documented with a reason and a review date.

## Vulnerability management
- Cloud configuration is scanned continuously and findings are tracked to resolution.
- Security patches are applied within these timelines from availability:

| Severity | Fix within |
| :--- | :--- |
| Critical | 7 days |
| High | 30 days |
| Medium | 90 days |
| Low | Next planned maintenance |

- An independent penetration test is performed at least annually and after major changes, and findings are fixed according to the same timelines.

## Monitoring
{{owner}} reports on the risk register, open findings and control status to leadership at least quarterly.
`,
  },
  {
    slug: 'human-resources-security',
    title: 'Human Resources Security Policy',
    summary: 'Background checks, onboarding, security training and offboarding.',
    controls: ['SOC2:CC1.1', 'SOC2:CC1.4', 'SOC2:CC1.5', 'SOC2:CC2.2', 'SOC2:CC6.2', 'PCI:12.6.1'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Human Resources Security Policy')}
## Purpose
To make sure people who join {{organization}} are trustworthy, understand their security responsibilities, and lose access promptly when they leave.

## Before joining
- Background checks are performed for new employees and contractors with access to production systems or customer data, where permitted by law and proportionate to the role.
- Employment and contractor agreements include confidentiality obligations.

## Onboarding
Within their first 30 days, every new person:
1. Reads and accepts the Information Security Policy, Acceptable Use Policy, Code of Conduct and other applicable policies.
2. Completes security awareness training.
3. Receives only the access their role requires, approved as described in the Access Control Policy.
4. Receives a company-managed device configured to the security baseline.

## Ongoing
- Security awareness training is completed by everyone at least once a year, covering phishing, passwords and MFA, data handling and incident reporting.
- Updated policies are re-accepted when they change materially.
- Performance reviews include adherence to security responsibilities.

## Offboarding
When someone leaves:
1. Their manager notifies HR and IT as early as possible.
2. All access is revoked within one business day (immediately for involuntary departures).
3. Company devices and data are returned and devices are wiped before reuse.
4. Shared credentials they knew are rotated.
5. The offboarding checklist is completed and kept as a record.
`,
  },
  {
    slug: 'code-of-conduct',
    title: 'Code of Conduct',
    summary: 'The standards of integrity and behavior expected of everyone.',
    controls: ['SOC2:CC1.1', 'SOC2:CC1.5'],
    reviewIntervalDays: 365,
    requiresSignoff: true,
    body: `${header('Code of Conduct')}
## Our commitment
{{organization}} does business honestly, legally and with respect for customers, colleagues and partners. This code applies to everyone who works with us.

## Integrity
- Act honestly and in good faith. Do not misrepresent our products, finances or security practices.
- Avoid conflicts of interest, and disclose any that arise to your manager.
- Do not offer or accept bribes, kickbacks or improper gifts.

## Respect
- Treat everyone with respect. Harassment, discrimination and bullying are not tolerated.
- Respect the privacy of customers and colleagues.

## Protecting information and assets
- Protect confidential information and company assets as described in our security policies.
- Use company resources responsibly and for legitimate business purposes.

## Following the law
Comply with all laws and regulations that apply to our work, including data protection, anti-corruption and export laws.

## Speaking up
If you see something that may violate this code, the law or our policies, report it to your manager, {{owner}} or leadership. Reports made in good faith are protected from retaliation.

## Consequences
Violations may result in disciplinary action, up to and including termination.
`,
  },
  {
    slug: 'asset-management',
    title: 'Asset and Device Management Policy',
    summary: 'Inventory and security baseline for laptops, servers and other assets, including physical security.',
    controls: ['SOC2:CC2.1', 'SOC2:CC6.4', 'SOC2:CC6.5', 'SOC2:CC6.8', 'CMMC:PE.L1-3.10.1', 'CMMC:PE.L1-3.10.3', 'CMMC:PE.L1-3.10.4', 'CMMC:PE.L1-3.10.5', 'CMMC:SI.L1-3.14.2', 'CMMC:SI.L1-3.14.4', 'CMMC:SI.L1-3.14.5', 'PCI:5.2.1'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Asset and Device Management Policy')}
## Purpose
To know what assets {{organization}} has and to keep them secure throughout their life.

## Inventory
{{owner}} maintains an inventory of company devices, cloud accounts and production systems, with an owner for each. Cloud resources are tracked through the cloud providers' inventories and ControlLayer scans.

## Device security baseline
Company laptops and workstations must have:
- Full-disk encryption enabled.
- A screen lock after 10 minutes or less of inactivity, with a password, PIN or biometric.
- Automatic operating system and browser updates.
- Endpoint protection (anti-malware) enabled and updating automatically, with periodic and real-time scanning.
- A firewall enabled.
Where possible, devices are enrolled in mobile device management (MDM) to enforce and report on this baseline.

## Lost or stolen devices
Report lost or stolen devices immediately so they can be locked or wiped remotely.

## Physical security
- Offices restrict entry to authorized people. Visitors are escorted and recorded in a visitor log.
- Keys and badges are issued, tracked and collected when people leave.
- Production systems run in cloud data centers whose physical security is covered by the providers' independent audit reports.

## Disposal
Devices are securely wiped or destroyed before disposal or reuse, as described in the Data Classification and Retention Policy.
`,
  },
  {
    slug: 'logging-monitoring',
    title: 'Logging and Monitoring Policy',
    summary: 'What is logged, how long logs are kept, and how alerts are handled.',
    controls: ['SOC2:CC7.2', 'SOC2:CC7.1', 'SOC2:CC4.1', 'SOC2:CC2.1', 'CMMC:SC.L1-3.13.1', 'PCI:10.2.1', 'PCI:10.5.1'],
    reviewIntervalDays: 365,
    requiresSignoff: false,
    body: `${header('Logging and Monitoring Policy')}
## Purpose
To record security-relevant activity so that problems and attacks are detected quickly and can be investigated.

## What is logged
- Cloud control-plane activity (for example AWS CloudTrail in all regions, Google Cloud audit logs including data access for sensitive services, Azure Activity Log).
- Sign-ins and administrative actions in the identity provider, email and code repositories.
- Application authentication events, permission changes and access to Restricted data.
- Network security events where available.

## Protecting logs
- Logs are sent to a central location that the people whose actions are logged cannot change or delete.
- Log integrity validation is enabled where the platform supports it.
- Logs are kept for at least 12 months, with at least the last 3 months immediately searchable.

## Monitoring and alerting
- Alerts are configured for high-risk events, such as root or global administrator sign-ins, disabled logging, changes to security groups or firewall rules, and repeated failed sign-ins.
- Alerts go to the on-call person and are triaged according to the Incident Response Plan.
- ControlLayer scans cloud configuration continuously; findings are reviewed and tracked to resolution.

## Clock synchronization
Systems use a trusted time source so that logs from different systems can be correlated.
`,
  },
];

export function renderTemplate(body: string, values: { organization: string; owner: string; effectiveDate: string; reviewIntervalDays: number }) {
  const review = values.reviewIntervalDays >= 365 ? 'At least annually' : `Every ${values.reviewIntervalDays} days`;
  return body
    .replaceAll('{{organization}}', values.organization)
    .replaceAll('{{owner}}', values.owner)
    .replaceAll('{{effective_date}}', values.effectiveDate)
    .replaceAll('{{review_period}}', review);
}
