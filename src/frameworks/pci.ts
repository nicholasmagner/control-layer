import type { FrameworkDef } from './types';

/**
 * PCI DSS v4.0 - a starter set of the requirements most relevant to cloud
 * environments and small merchants / service providers. Descriptions are
 * plain-language summaries; consult the official standard for exact wording.
 */
export const PCI: FrameworkDef = {
  id: 'PCI',
  name: 'PCI DSS v4.0',
  shortName: 'PCI DSS',
  version: '4.0',
  description:
    'Core PCI DSS requirements for cloud-hosted cardholder data environments. Preview: covers the most commonly tested requirements, not the full standard.',
  coverage: 'preview',
  controls: [
    { id: '1.3.1', category: 'Network Security Controls', title: 'Restrict inbound traffic', description: 'Inbound traffic to the cardholder data environment is restricted to only what is necessary.', evidence: ['Firewall / security group rules', 'Justification for each allowed inbound rule'] },
    { id: '1.4.1', category: 'Network Security Controls', title: 'Trusted and untrusted networks', description: 'Network security controls sit between trusted and untrusted networks; system components are not directly exposed to the internet without need.', evidence: ['Network diagram', 'List of internet-exposed resources'] },
    { id: '2.2.1', category: 'Secure Configuration', title: 'Configuration standards', description: 'Configuration standards are defined, implemented and kept up to date for all system components.', evidence: ['Hardening baselines', 'Configuration scan results'] },
    { id: '2.2.7', category: 'Secure Configuration', title: 'Encrypted administrative access', description: 'All non-console administrative access is encrypted with strong cryptography.', evidence: ['TLS / SSH configuration'] },
    { id: '3.5.1', category: 'Protect Stored Account Data', title: 'Stored card data unreadable', description: 'Primary account numbers are rendered unreadable wherever stored, for example with strong encryption.', evidence: ['Encryption at rest configuration for databases and storage'] },
    { id: '3.7.1', category: 'Protect Stored Account Data', title: 'Key management', description: 'Key management procedures protect cryptographic keys, including generation, storage and rotation.', evidence: ['Key management procedure', 'Key vault / KMS configuration'] },
    { id: '4.2.1', category: 'Protect Data in Transit', title: 'Strong cryptography in transit', description: 'Strong cryptography protects card data sent over open, public networks.', evidence: ['TLS enforcement and minimum version settings'] },
    { id: '5.2.1', category: 'Malware Protection', title: 'Anti-malware deployed', description: 'Anti-malware is deployed on system components, except those evaluated as not at risk.', evidence: ['Endpoint protection deployment report'] },
    { id: '6.3.3', category: 'Secure Systems & Software', title: 'Security patches', description: 'Critical security patches are installed within one month of release.', evidence: ['Patch management records'], freshnessDays: 90 },
    { id: '6.5.1', category: 'Secure Systems & Software', title: 'Change control', description: 'Changes to system components are documented, approved and tested.', evidence: ['Change management policy', 'Approved change records'] },
    { id: '7.2.1', category: 'Restrict Access', title: 'Access control model', description: 'An access control model grants least privilege based on job function.', evidence: ['Role / permission matrix', 'Evidence that broad admin roles are limited'] },
    { id: '7.2.4', category: 'Restrict Access', title: 'Periodic access reviews', description: 'User accounts and access privileges are reviewed at least every six months.', evidence: ['Access review sign-off'], freshnessDays: 180 },
    { id: '8.2.6', category: 'Identify & Authenticate', title: 'Inactive accounts', description: 'Inactive user accounts are removed or disabled within 90 days.', evidence: ['Inactive account report'] },
    { id: '8.3.6', category: 'Identify & Authenticate', title: 'Password strength', description: 'Passwords are at least 12 characters and contain both numbers and letters.', evidence: ['Password policy configuration'] },
    { id: '8.4.2', category: 'Identify & Authenticate', title: 'MFA into the CDE', description: 'Multi-factor authentication is required for all access into the cardholder data environment.', evidence: ['MFA enforcement configuration'] },
    { id: '8.6.3', category: 'Identify & Authenticate', title: 'System account credentials', description: 'Credentials for application and system accounts are protected and changed periodically.', evidence: ['Access key / service account key rotation records'] },
    { id: '9.4.7', category: 'Physical Access', title: 'Media destruction', description: 'Media with cardholder data is destroyed when no longer needed.', evidence: ['Media destruction records', "Cloud provider's attestation"] },
    { id: '10.2.1', category: 'Logging & Monitoring', title: 'Audit logs enabled', description: 'Audit logs are enabled and active for all system components.', evidence: ['Audit logging configuration'] },
    { id: '10.5.1', category: 'Logging & Monitoring', title: 'Log retention', description: 'Audit log history is retained for at least 12 months, with three months immediately available.', evidence: ['Log retention settings'] },
    { id: '11.3.1', category: 'Security Testing', title: 'Internal vulnerability scans', description: 'Internal vulnerability scans are performed at least every three months.', evidence: ['Quarterly scan reports'], freshnessDays: 90 },
    { id: '11.4.1', category: 'Security Testing', title: 'Penetration testing', description: 'Penetration testing is performed at least annually and after significant changes.', evidence: ['Penetration test report'] },
    { id: '12.1.1', category: 'Policy & Program', title: 'Information security policy', description: 'An information security policy is established, published, maintained and shared with staff.', evidence: ['Information security policy', 'Annual review record'] },
    { id: '12.6.1', category: 'Policy & Program', title: 'Security awareness', description: 'A formal security awareness program makes staff aware of the security policy and their role.', evidence: ['Training completion records'] },
    { id: '12.8.1', category: 'Policy & Program', title: 'Service provider list', description: 'A list of third-party service providers that handle account data is maintained.', evidence: ['Vendor inventory'] },
    { id: '12.10.1', category: 'Policy & Program', title: 'Incident response plan', description: 'An incident response plan exists and is ready to be activated.', evidence: ['Incident response plan'] },
  ],
};
