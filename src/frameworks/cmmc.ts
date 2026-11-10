import type { FrameworkDef } from './types';

/**
 * CMMC 2.0 Level 1 (Foundational): the 17 practices derived from
 * FAR 52.204-21 / NIST SP 800-171. Required for contractors handling Federal
 * Contract Information (FCI).
 */
export const CMMC: FrameworkDef = {
  id: 'CMMC',
  name: 'CMMC 2.0 Level 1',
  shortName: 'CMMC L1',
  version: '2.0',
  description: 'The 17 foundational practices for protecting Federal Contract Information (FCI).',
  coverage: 'full',
  controls: [
    {
      id: 'AC.L1-3.1.1', category: 'Access Control',
      title: 'Authorized access control',
      description: 'Limit system access to authorized users, processes acting on behalf of authorized users, and devices.',
      evidence: ['List of authorized users and their accounts', 'Account provisioning procedure', 'MFA configuration'],
    },
    {
      id: 'AC.L1-3.1.2', category: 'Access Control',
      title: 'Transaction and function control',
      description: 'Limit system access to the types of transactions and functions that authorized users are permitted to execute.',
      evidence: ['Role / permission definitions', 'Evidence that admin rights are limited'],
    },
    {
      id: 'AC.L1-3.1.20', category: 'Access Control',
      title: 'External connections',
      description: 'Verify and control or limit connections to and use of external systems.',
      evidence: ['Firewall / security group rules', 'Policy on use of external systems'],
    },
    {
      id: 'AC.L1-3.1.22', category: 'Access Control',
      title: 'Control public information',
      description: 'Control information posted or processed on publicly accessible systems.',
      evidence: ['Procedure for reviewing content before publication', 'List of public storage / websites'],
    },
    {
      id: 'IA.L1-3.5.1', category: 'Identification & Authentication',
      title: 'Identification',
      description: 'Identify system users, processes acting on behalf of users, and devices.',
      evidence: ['User and service account inventory'],
    },
    {
      id: 'IA.L1-3.5.2', category: 'Identification & Authentication',
      title: 'Authentication',
      description: 'Authenticate (verify) the identities of users, processes, or devices before allowing access.',
      evidence: ['Password policy', 'MFA configuration', 'Credential rotation records'],
    },
    {
      id: 'MP.L1-3.8.3', category: 'Media Protection',
      title: 'Media disposal',
      description: 'Sanitize or destroy media containing Federal Contract Information before disposal or reuse.',
      evidence: ['Media sanitization procedure', 'Disposal / destruction records'],
    },
    {
      id: 'PE.L1-3.10.1', category: 'Physical Protection',
      title: 'Limit physical access',
      description: 'Limit physical access to systems, equipment, and operating environments to authorized individuals.',
      evidence: ['Facility access list', "Cloud provider's physical security attestation"],
    },
    {
      id: 'PE.L1-3.10.3', category: 'Physical Protection',
      title: 'Escort visitors',
      description: 'Escort visitors and monitor visitor activity.',
      evidence: ['Visitor policy'],
    },
    {
      id: 'PE.L1-3.10.4', category: 'Physical Protection',
      title: 'Physical access logs',
      description: 'Maintain audit logs of physical access.',
      evidence: ['Visitor or badge access logs'],
    },
    {
      id: 'PE.L1-3.10.5', category: 'Physical Protection',
      title: 'Manage physical access devices',
      description: 'Control and manage physical access devices such as keys, locks and badges.',
      evidence: ['Key / badge inventory'],
    },
    {
      id: 'SC.L1-3.13.1', category: 'System & Communications Protection',
      title: 'Boundary protection',
      description: 'Monitor, control, and protect communications at the external and key internal boundaries of systems.',
      evidence: ['Firewall / security group rules', 'Network diagram'],
    },
    {
      id: 'SC.L1-3.13.5', category: 'System & Communications Protection',
      title: 'Public-access system separation',
      description: 'Implement subnetworks for publicly accessible system components that are separated from internal networks.',
      evidence: ['Network diagram showing public and private subnets', 'List of internet-exposed resources'],
    },
    {
      id: 'SI.L1-3.14.1', category: 'System & Information Integrity',
      title: 'Flaw remediation',
      description: 'Identify, report, and correct system flaws in a timely manner.',
      evidence: ['Patch management procedure', 'Findings tracked to resolution'],
    },
    {
      id: 'SI.L1-3.14.2', category: 'System & Information Integrity',
      title: 'Malicious code protection',
      description: 'Provide protection from malicious code at appropriate locations within systems.',
      evidence: ['Endpoint protection deployment report'],
    },
    {
      id: 'SI.L1-3.14.4', category: 'System & Information Integrity',
      title: 'Update malicious code protection',
      description: 'Update malicious code protection mechanisms when new releases are available.',
      evidence: ['Endpoint protection update settings'],
    },
    {
      id: 'SI.L1-3.14.5', category: 'System & Information Integrity',
      title: 'System and file scanning',
      description: 'Perform periodic scans of systems and real-time scans of files from external sources.',
      evidence: ['Scan schedule and recent scan results'],
      freshnessDays: 90,
    },
  ],
};
