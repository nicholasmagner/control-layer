import type { FrameworkDef } from './types';

/**
 * SOC 2 Trust Services Criteria (2017, revised points of focus 2022).
 * Security (Common Criteria) is required for every SOC 2 report; Availability
 * and Confidentiality are the two optional categories most small companies add.
 * Descriptions are plain-language summaries, not the official criteria text.
 */
export const SOC2: FrameworkDef = {
  id: 'SOC2',
  name: 'SOC 2',
  shortName: 'SOC 2',
  version: 'TSC 2017 (rev. 2022)',
  description:
    'Trust Services Criteria for Security (required), Availability and Confidentiality. Mark categories you are not including in your report as Not Applicable.',
  coverage: 'full',
  controls: [
    // CC1 Control Environment
    {
      id: 'CC1.1', category: 'Control Environment',
      title: 'Integrity and ethical values',
      description: 'Leadership demonstrates a commitment to integrity and ethical values, documented in a code of conduct that staff acknowledge.',
      evidence: ['Code of conduct', 'Signed code-of-conduct acknowledgments for staff', 'Background check procedure for new hires'],
    },
    {
      id: 'CC1.2', category: 'Control Environment',
      title: 'Oversight of internal control',
      description: 'A board, advisors, or leadership group independent of day-to-day operations oversees the security program.',
      evidence: ['Board or leadership meeting minutes where security was reviewed', 'Charter or description of the oversight group'],
    },
    {
      id: 'CC1.3', category: 'Control Environment',
      title: 'Structure, reporting lines and authority',
      description: 'Management defines the organization structure, reporting lines, and who is responsible for security.',
      evidence: ['Organization chart', 'Job descriptions that include security responsibilities'],
    },
    {
      id: 'CC1.4', category: 'Control Environment',
      title: 'Competent personnel',
      description: 'The organization hires, trains and retains people with the skills needed, including security awareness training.',
      evidence: ['Security awareness training completion records', 'Hiring procedure / interview process'],
    },
    {
      id: 'CC1.5', category: 'Control Environment',
      title: 'Accountability',
      description: 'People are held accountable for their security responsibilities, for example through performance reviews and a disciplinary policy.',
      evidence: ['Disciplinary or sanctions policy', 'Performance review template covering security responsibilities'],
    },
    // CC2 Communication and Information
    {
      id: 'CC2.1', category: 'Communication & Information',
      title: 'Quality information for internal control',
      description: 'The organization knows what systems and data it has and collects the information needed to operate controls.',
      evidence: ['System / asset inventory', 'Network or data flow diagram', 'Audit logging configuration'],
    },
    {
      id: 'CC2.2', category: 'Communication & Information',
      title: 'Internal communication',
      description: 'Security objectives, policies and responsibilities are communicated to staff, and staff have a way to report concerns.',
      evidence: ['Information security policy published to staff', 'Policy acknowledgment records', 'Internal channel for reporting security issues'],
    },
    {
      id: 'CC2.3', category: 'Communication & Information',
      title: 'External communication',
      description: 'Security commitments are communicated to customers and partners, and outsiders can report issues.',
      evidence: ['Customer terms or security commitments', 'Public security / vulnerability disclosure page', 'System description shared with customers'],
    },
    // CC3 Risk Assessment
    {
      id: 'CC3.1', category: 'Risk Assessment',
      title: 'Clear objectives',
      description: 'Objectives are defined clearly enough that risks to achieving them can be identified.',
      evidence: ['Documented security objectives', 'Risk assessment policy'],
    },
    {
      id: 'CC3.2', category: 'Risk Assessment',
      title: 'Risk identification and analysis',
      description: 'Risks are identified and analyzed at least annually to decide how they should be managed.',
      evidence: ['Annual risk assessment', 'Risk register with likelihood, impact and owner'],
    },
    {
      id: 'CC3.3', category: 'Risk Assessment',
      title: 'Fraud risk',
      description: 'The risk assessment considers the potential for fraud.',
      evidence: ['Risk assessment section covering fraud scenarios'],
    },
    {
      id: 'CC3.4', category: 'Risk Assessment',
      title: 'Changes that affect controls',
      description: 'Significant changes (new products, vendors, leadership, architecture) are assessed for their effect on controls.',
      evidence: ['Risk register updates tied to significant changes'],
    },
    // CC4 Monitoring Activities
    {
      id: 'CC4.1', category: 'Monitoring Activities',
      title: 'Ongoing evaluations',
      description: 'Controls are evaluated on an ongoing basis, through continuous monitoring, internal reviews or third-party testing.',
      evidence: ['Continuous monitoring results', 'Penetration test or internal audit report'],
    },
    {
      id: 'CC4.2', category: 'Monitoring Activities',
      title: 'Communicating deficiencies',
      description: 'Control deficiencies are reported to the people responsible and tracked until fixed.',
      evidence: ['Findings or tickets showing deficiencies tracked to resolution'],
    },
    // CC5 Control Activities
    {
      id: 'CC5.1', category: 'Control Activities',
      title: 'Controls that mitigate risk',
      description: 'Control activities are chosen to bring identified risks down to acceptable levels.',
      evidence: ['Risk treatment plan mapping risks to controls'],
    },
    {
      id: 'CC5.2', category: 'Control Activities',
      title: 'Technology general controls',
      description: 'General controls over technology (access, configuration, operations) are in place.',
      evidence: ['Configuration standards or hardening baselines', 'Cloud configuration scan results'],
    },
    {
      id: 'CC5.3', category: 'Control Activities',
      title: 'Policies and procedures',
      description: 'Controls are deployed through written policies and procedures that are reviewed and approved.',
      evidence: ['Approved policy set with owner and last review date'],
    },
    // CC6 Logical and Physical Access
    {
      id: 'CC6.1', category: 'Logical & Physical Access',
      title: 'Logical access security',
      description: 'Access to systems and data is protected: strong authentication (MFA), restricted administrative access and encryption of sensitive data.',
      evidence: ['MFA enforcement for all users', 'Encryption at rest configuration', 'Access control configuration for production'],
    },
    {
      id: 'CC6.2', category: 'Logical & Physical Access',
      title: 'User registration and removal',
      description: 'Access is approved before it is granted and removed promptly when people leave or change roles.',
      evidence: ['Onboarding access requests with approval', 'Offboarding checklist / tickets', 'Report of inactive accounts'],
      freshnessDays: 90,
    },
    {
      id: 'CC6.3', category: 'Logical & Physical Access',
      title: 'Role-based access and least privilege',
      description: 'Access is based on roles and least privilege, and is reviewed periodically.',
      evidence: ['Role / permission matrix', 'Quarterly user access review sign-off'],
      freshnessDays: 90,
    },
    {
      id: 'CC6.4', category: 'Logical & Physical Access',
      title: 'Physical access',
      description: 'Physical access to facilities and hardware is restricted. For cloud-hosted systems this is usually covered by the cloud provider.',
      evidence: ["Cloud provider's SOC 2 report", 'Office access control procedure (if applicable)'],
    },
    {
      id: 'CC6.5', category: 'Logical & Physical Access',
      title: 'Secure disposal',
      description: 'Data is wiped or destroyed before hardware or media is disposed of or reused.',
      evidence: ['Device disposal / data destruction records'],
    },
    {
      id: 'CC6.6', category: 'Logical & Physical Access',
      title: 'Protection from external threats',
      description: 'Systems are protected from threats outside the boundary: firewalls, no unnecessary public exposure, no administrative ports open to the internet.',
      evidence: ['Firewall / security group rules', 'List of internet-exposed resources'],
    },
    {
      id: 'CC6.7', category: 'Logical & Physical Access',
      title: 'Data in transit and removal',
      description: 'Data is protected in transit (TLS) and its movement to removable media or outside parties is restricted.',
      evidence: ['TLS enforcement settings', 'Device management (MDM) policy'],
    },
    {
      id: 'CC6.8', category: 'Logical & Physical Access',
      title: 'Malicious software',
      description: 'Controls prevent or detect malware and unauthorized software.',
      evidence: ['Endpoint protection deployment report', 'MDM software restrictions'],
    },
    // CC7 System Operations
    {
      id: 'CC7.1', category: 'System Operations',
      title: 'Configuration and vulnerability monitoring',
      description: 'Configuration changes and new vulnerabilities are detected through monitoring and scanning.',
      evidence: ['Vulnerability scan results', 'Cloud configuration scan results'],
      freshnessDays: 90,
    },
    {
      id: 'CC7.2', category: 'System Operations',
      title: 'Security monitoring',
      description: 'Systems are monitored for anomalies that may indicate an attack, with audit logging enabled.',
      evidence: ['Audit logging enabled (e.g. CloudTrail)', 'Alerting configuration'],
    },
    {
      id: 'CC7.3', category: 'System Operations',
      title: 'Evaluating security events',
      description: 'Security events are evaluated to decide whether they are incidents.',
      evidence: ['Incident response procedure', 'Triage log or tickets'],
    },
    {
      id: 'CC7.4', category: 'System Operations',
      title: 'Incident response',
      description: 'Incidents are contained, fixed and communicated according to a defined plan.',
      evidence: ['Incident response plan', 'Incident tickets or tabletop exercise record'],
    },
    {
      id: 'CC7.5', category: 'System Operations',
      title: 'Incident recovery',
      description: 'The organization recovers from incidents and learns from them.',
      evidence: ['Post-incident review', 'Recovery procedures'],
    },
    // CC8 Change Management
    {
      id: 'CC8.1', category: 'Change Management',
      title: 'Change management',
      description: 'Changes to infrastructure and software are authorized, tested, approved and documented.',
      evidence: ['Change management policy', 'Pull requests with approvals', 'CI/CD test logs'],
    },
    // CC9 Risk Mitigation
    {
      id: 'CC9.1', category: 'Risk Mitigation',
      title: 'Business disruption',
      description: 'Risks from business disruption are mitigated through continuity planning and, where appropriate, insurance.',
      evidence: ['Business continuity plan', 'Cyber insurance policy'],
    },
    {
      id: 'CC9.2', category: 'Risk Mitigation',
      title: 'Vendor risk',
      description: 'Risks from vendors and business partners are assessed and managed.',
      evidence: ['Vendor inventory', 'Reviewed vendor SOC 2 reports or questionnaires'],
    },
    // A1 Availability
    {
      id: 'A1.1', category: 'Availability',
      title: 'Capacity management',
      description: 'Capacity is monitored and managed to meet availability commitments.',
      evidence: ['Capacity / uptime monitoring dashboards', 'Autoscaling configuration'],
    },
    {
      id: 'A1.2', category: 'Availability',
      title: 'Backups and recovery infrastructure',
      description: 'Backups, redundancy and environmental protections support recovery.',
      evidence: ['Backup configuration and retention', 'Multi-zone / redundancy configuration'],
    },
    {
      id: 'A1.3', category: 'Availability',
      title: 'Recovery testing',
      description: 'Recovery procedures, including restoring from backup, are tested.',
      evidence: ['Backup restore test record', 'Disaster recovery test results'],
    },
    // C1 Confidentiality
    {
      id: 'C1.1', category: 'Confidentiality',
      title: 'Identifying and protecting confidential information',
      description: 'Confidential information is identified, classified and protected, including encryption at rest.',
      evidence: ['Data classification policy', 'Encryption at rest configuration'],
    },
    {
      id: 'C1.2', category: 'Confidentiality',
      title: 'Disposal of confidential information',
      description: 'Confidential information is deleted when it is no longer needed, per a retention schedule.',
      evidence: ['Data retention policy', 'Deletion records'],
    },
  ],
};
