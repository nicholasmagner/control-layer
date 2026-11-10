import type { ControlDef, FrameworkDef } from './types';

/**
 * HIPAA Security Rule (45 CFR Part 164, Subpart C): the administrative,
 * physical and technical safeguards for electronic protected health
 * information (ePHI), at the level of standards and implementation
 * specifications. (R) = required, (A) = addressable.
 */

const c = (id: string, title: string, category: string, description: string, evidence: string[], freshnessDays?: number): ControlDef =>
  ({ id, title, category, description, evidence, ...(freshnessDays ? { freshnessDays } : {}) });
const ADM = 'Administrative safeguards';
const PHY = 'Physical safeguards';
const TEC = 'Technical safeguards';
const DOC = 'Policies and documentation';

export const HIPAA: FrameworkDef = {
  id: 'HIPAA',
  name: 'HIPAA Security Rule',
  shortName: 'HIPAA',
  version: '45 CFR 164 Subpart C',
  description: 'Safeguards for electronic protected health information (ePHI), for covered entities and business associates.',
  coverage: 'full',
  controls: [
    c('164.308(a)(1)(ii)(A)', 'Risk analysis (R)', ADM, 'Assess the risks and vulnerabilities to the confidentiality, integrity and availability of ePHI.', ['Risk assessment covering ePHI', 'Risk register'], 365),
    c('164.308(a)(1)(ii)(B)', 'Risk management (R)', ADM, 'Put security measures in place that reduce risks to a reasonable level.', ['Risk treatment plans', 'Control status']),
    c('164.308(a)(1)(ii)(C)', 'Sanction policy (R)', ADM, 'Apply sanctions to workforce members who violate security policies.', ['Sanction policy', 'Code of conduct']),
    c('164.308(a)(1)(ii)(D)', 'Information system activity review (R)', ADM, 'Regularly review records of system activity such as audit logs and access reports.', ['Audit logging', 'Log review records'], 90),
    c('164.308(a)(2)', 'Assigned security responsibility (R)', ADM, 'Name the security official responsible for the security program.', ['Security officer designation']),
    c('164.308(a)(3)(ii)(A)', 'Authorization and/or supervision (A)', ADM, 'Authorize and supervise workforce members who work with ePHI.', ['Access approvals']),
    c('164.308(a)(3)(ii)(B)', 'Workforce clearance procedure (A)', ADM, 'Determine that a workforce member\'s access to ePHI is appropriate.', ['Background checks', 'Role-based access']),
    c('164.308(a)(3)(ii)(C)', 'Termination procedures (A)', ADM, 'End access to ePHI when employment ends.', ['Offboarding records', 'Accounts disabled for people who left']),
    c('164.308(a)(4)(ii)(B)', 'Access authorization (A)', ADM, 'Policies for granting access to ePHI.', ['Access control policy', 'Access requests']),
    c('164.308(a)(4)(ii)(C)', 'Access establishment and modification (A)', ADM, 'Establish, document, review and modify access rights.', ['Access review records'], 90),
    c('164.308(a)(5)(ii)(A)', 'Security reminders (A)', ADM, 'Send periodic security updates to the workforce.', ['Security reminders sent']),
    c('164.308(a)(5)(ii)(B)', 'Protection from malicious software (A)', ADM, 'Procedures to guard against, detect and report malware.', ['Antivirus status on devices']),
    c('164.308(a)(5)(ii)(C)', 'Log-in monitoring (A)', ADM, 'Monitor log-in attempts and report discrepancies.', ['Sign-in logging and alerting']),
    c('164.308(a)(5)(ii)(D)', 'Password management (A)', ADM, 'Procedures for creating, changing and protecting passwords.', ['Password policy', 'MFA']),
    c('164.308(a)(6)(ii)', 'Security incident procedures: response and reporting (R)', ADM, 'Identify, respond to, mitigate and document security incidents.', ['Incident response plan', 'Incident records']),
    c('164.308(a)(7)(ii)(A)', 'Data backup plan (R)', ADM, 'Create and keep retrievable exact copies of ePHI.', ['Backup configuration']),
    c('164.308(a)(7)(ii)(B)', 'Disaster recovery plan (R)', ADM, 'Procedures to restore any loss of data.', ['Disaster recovery plan']),
    c('164.308(a)(7)(ii)(C)', 'Emergency mode operation plan (R)', ADM, 'Keep critical processes running and ePHI protected during emergencies.', ['Business continuity plan']),
    c('164.308(a)(7)(ii)(D)', 'Testing and revision procedures (A)', ADM, 'Test and revise contingency plans periodically.', ['DR test records'], 365),
    c('164.308(a)(7)(ii)(E)', 'Applications and data criticality analysis (A)', ADM, 'Assess how critical applications and data are to support contingency planning.', ['Criticality analysis']),
    c('164.308(a)(8)', 'Evaluation (R)', ADM, 'Periodically evaluate how well security policies and procedures meet the rule.', ['Annual compliance evaluation'], 365),
    c('164.308(b)(1)', 'Business associate contracts (R)', ADM, 'Have written agreements with business associates that create, receive, keep or send ePHI.', ['Signed business associate agreements (BAAs)', 'Vendor inventory']),
    c('164.310(a)(1)', 'Facility access controls', PHY, 'Limit physical access to systems with ePHI and the facilities they are in.', ['Office access controls', 'Data center reports']),
    c('164.310(b)', 'Workstation use (R)', PHY, 'Rules for how workstations that access ePHI are used.', ['Acceptable use policy']),
    c('164.310(c)', 'Workstation security (R)', PHY, 'Physical safeguards for workstations that access ePHI.', ['Device encryption and screen lock status']),
    c('164.310(d)(1)', 'Device and media controls', PHY, 'Control the movement, disposal and re-use of hardware and media with ePHI.', ['Disposal records', 'Device inventory']),
    c('164.312(a)(2)(i)', 'Unique user identification (R)', TEC, 'Give every user a unique name or number.', ['User lists without shared accounts']),
    c('164.312(a)(2)(ii)', 'Emergency access procedure (R)', TEC, 'Procedures for getting ePHI during an emergency.', ['Break-glass procedure']),
    c('164.312(a)(2)(iii)', 'Automatic logoff (A)', TEC, 'End sessions after a period of inactivity.', ['Screen lock and session timeout settings']),
    c('164.312(a)(2)(iv)', 'Encryption and decryption (A)', TEC, 'Encrypt ePHI at rest.', ['Encryption at rest settings', 'Disk encryption status']),
    c('164.312(b)', 'Audit controls (R)', TEC, 'Record and examine activity in systems that contain ePHI.', ['Audit logging configuration']),
    c('164.312(c)(1)', 'Integrity (A)', TEC, 'Protect ePHI from improper change or destruction.', ['Integrity controls', 'Backups']),
    c('164.312(d)', 'Person or entity authentication (R)', TEC, 'Verify that people and systems are who they claim to be.', ['MFA configuration']),
    c('164.312(e)(1)', 'Transmission security', TEC, 'Protect ePHI sent over networks, including encryption.', ['TLS settings', 'Encryption in transit']),
    c('164.316(b)(1)', 'Policies, procedures and documentation (R)', DOC, 'Document policies and procedures, keep them 6 years, make them available, and review them.', ['Published policies with versions'], 365),
  ],
};
