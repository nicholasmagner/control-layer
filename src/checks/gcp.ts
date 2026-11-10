import { adminPortsInRange, coversTcp, isOpenSource, parsePortRange } from './network';
import { CheckDef, DAY_MS, MAX_CREDENTIAL_AGE_DAYS, ResourceResult } from './types';

export interface GcpInventory {
  projectId: string;
  collectedAt: string;
  iamBindings?: { role: string; members: string[] }[];
  auditConfigs?: { service: string; logTypes: string[] }[];
  serviceAccountKeys?: { account: string; keyId: string; createdAt: string }[];
  buckets?: { name: string; publicMembers: string[]; uniformAccess: boolean; publicAccessPrevention?: string }[];
  instances?: { name: string; zone: string; externalIps: string[] }[];
  firewalls?: {
    name: string;
    direction: string;
    disabled: boolean;
    sourceRanges: string[];
    allowed: { protocol: string; ports: string[] }[];
  }[];
  sqlInstances?: {
    name: string;
    publicIpEnabled: boolean;
    authorizedNetworks: string[];
    backupsEnabled: boolean;
    sslRequired: boolean;
  }[];
}

const PUBLIC_MEMBERS = new Set(['allUsers', 'allAuthenticatedUsers']);
const BASIC_ROLES = new Set(['roles/owner', 'roles/editor']);

export const GCP_CHECKS: CheckDef<GcpInventory>[] = [
  {
    id: 'gcp.basic_roles',
    provider: 'gcp',
    title: 'No broad Owner/Editor grants',
    description: 'The basic Owner and Editor roles grant almost everything in a project. Least privilege means using predefined or custom roles instead.',
    severity: 'Medium',
    remediation: 'In IAM & Admin > IAM, replace Owner/Editor grants with narrower predefined roles. Keep Owner to one or two break-glass administrators.',
    controls: { SOC2: ['CC6.3'], CMMC: ['AC.L1-3.1.2'], PCI: ['7.2.1'] },
    evaluate: inv => {
      if (!inv.iamBindings) return null;
      const results: ResourceResult[] = [];
      const owners = inv.iamBindings.filter(b => b.role === 'roles/owner').flatMap(b => b.members);
      for (const b of inv.iamBindings.filter(b => BASIC_ROLES.has(b.role))) {
        for (const m of b.members) {
          // A small number of human owners is normal; editors and service
          // account owners are the over-privileged pattern auditors flag.
          const allowed = b.role === 'roles/owner' && m.startsWith('user:') && owners.length <= 2;
          results.push({
            resourceId: `projects/${inv.projectId}/${b.role}/${m}`, resourceName: `${m} (${b.role.replace('roles/', '')})`,
            status: allowed ? 'pass' : 'fail',
            message: allowed ? `${m} is one of ${owners.length} project owner(s).` : `${m} has the broad ${b.role} role.`,
          });
        }
      }
      if (results.length === 0) {
        results.push({ resourceId: `projects/${inv.projectId}`, resourceName: inv.projectId, status: 'pass', message: 'No Owner/Editor grants found.' });
      }
      return results;
    },
  },
  {
    id: 'gcp.public_project_iam',
    provider: 'gcp',
    title: 'Project IAM not open to the public',
    description: 'Granting project roles to allUsers or allAuthenticatedUsers exposes resources to anyone.',
    severity: 'High',
    remediation: 'Remove allUsers / allAuthenticatedUsers from the project IAM policy.',
    controls: { SOC2: ['CC6.1'], CMMC: ['AC.L1-3.1.1'], PCI: ['7.2.1'] },
    evaluate: inv => {
      if (!inv.iamBindings) return null;
      const exposed = inv.iamBindings.filter(b => b.members.some(m => PUBLIC_MEMBERS.has(m)));
      return [{
        resourceId: `projects/${inv.projectId}`, resourceName: inv.projectId,
        status: exposed.length ? 'fail' : 'pass',
        message: exposed.length ? `Public members hold: ${exposed.map(b => b.role).join(', ')}.` : 'No project roles are granted to the public.',
      }];
    },
  },
  {
    id: 'gcp.sa_key_rotation',
    provider: 'gcp',
    title: 'Service account keys rotated within 90 days',
    description: 'User-managed service account keys are long-lived secrets and should be rotated or replaced with workload identity.',
    severity: 'Medium',
    remediation: 'Create a new key, update the system using it, then delete the old key. Prefer Workload Identity Federation over keys.',
    controls: { SOC2: ['CC6.1'], CMMC: ['IA.L1-3.5.2'], PCI: ['8.6.3'] },
    evaluate: inv => {
      if (!inv.serviceAccountKeys) return null;
      return inv.serviceAccountKeys.map<ResourceResult>(k => {
        const age = Math.floor((Date.parse(inv.collectedAt) - Date.parse(k.createdAt)) / DAY_MS);
        const stale = age > MAX_CREDENTIAL_AGE_DAYS;
        return {
          resourceId: `${k.account}/keys/${k.keyId}`, resourceName: `${k.account} key ${k.keyId.slice(0, 8)}`,
          status: stale ? 'fail' : 'pass',
          message: stale ? `Key for ${k.account} is ${age} days old.` : `Key for ${k.account} is ${age} days old.`,
          details: { ageDays: age },
        };
      });
    },
  },
  {
    id: 'gcp.audit_logging',
    provider: 'gcp',
    title: 'Data Access audit logs enabled',
    description: 'Admin Activity logs are always on; Data Access logs (reads and writes of data) must be enabled to see who accessed what.',
    severity: 'Medium',
    remediation: 'In IAM & Admin > Audit Logs, enable "Data Read" and "Data Write" for all services (or at least for services holding sensitive data).',
    controls: { SOC2: ['CC7.2'], PCI: ['10.2.1'] },
    evaluate: inv => {
      if (!inv.auditConfigs) return null;
      const all = inv.auditConfigs.find(c => c.service === 'allServices');
      const ok = !!all && all.logTypes.includes('DATA_READ') && all.logTypes.includes('DATA_WRITE');
      return [{
        resourceId: `projects/${inv.projectId}/auditConfigs`, resourceName: inv.projectId,
        status: ok ? 'pass' : 'fail',
        message: ok ? 'Data Access audit logs are enabled for all services.' : 'Data Access audit logs are not enabled for all services.',
        details: { auditConfigs: inv.auditConfigs },
      }];
    },
  },
  {
    id: 'gcp.bucket_public',
    provider: 'gcp',
    title: 'Cloud Storage buckets are not public',
    description: 'Buckets should not grant access to allUsers or allAuthenticatedUsers unless they intentionally host public content.',
    severity: 'High',
    remediation: 'Remove allUsers / allAuthenticatedUsers from the bucket permissions and enable "Public access prevention".',
    controls: { SOC2: ['CC6.1', 'CC6.6'], CMMC: ['AC.L1-3.1.22'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.buckets) return null;
      return inv.buckets.map<ResourceResult>(b => ({
        resourceId: `gs://${b.name}`, resourceName: b.name,
        status: b.publicMembers.length ? 'fail' : 'pass',
        message: b.publicMembers.length ? `${b.name} is readable by ${b.publicMembers.join(', ')}.` : `${b.name} is private.`,
      }));
    },
  },
  {
    id: 'gcp.bucket_uniform_access',
    provider: 'gcp',
    title: 'Buckets use uniform access control',
    description: 'Uniform bucket-level access disables per-object ACLs so permissions are managed in one place.',
    severity: 'Low',
    remediation: 'Open the bucket > Permissions and switch "Access control" to Uniform.',
    controls: { SOC2: ['CC6.1'] },
    evaluate: inv => {
      if (!inv.buckets) return null;
      return inv.buckets.map<ResourceResult>(b => ({
        resourceId: `gs://${b.name}`, resourceName: b.name,
        status: b.uniformAccess ? 'pass' : 'fail',
        message: b.uniformAccess ? `${b.name} uses uniform access.` : `${b.name} uses per-object ACLs.`,
      }));
    },
  },
  {
    id: 'gcp.firewall_open_admin',
    provider: 'gcp',
    title: 'No SSH/RDP open to the internet',
    description: 'VPC firewall rules should not allow SSH (22) or RDP (3389) from 0.0.0.0/0.',
    severity: 'High',
    remediation: 'Restrict the rule source ranges to known IPs, or delete it and use Identity-Aware Proxy (IAP) TCP forwarding.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.1', 'AC.L1-3.1.20'], PCI: ['1.3.1'] },
    evaluate: inv => {
      if (!inv.firewalls) return null;
      return inv.firewalls.filter(f => f.direction === 'INGRESS').map<ResourceResult>(f => {
        const open = new Set<number>();
        if (!f.disabled && f.sourceRanges.some(isOpenSource)) {
          for (const a of f.allowed) {
            if (!coversTcp(a.protocol)) continue;
            const specs = a.ports.length ? a.ports : [undefined];
            specs.forEach(s => adminPortsInRange(parsePortRange(s)).forEach(p => open.add(p)));
          }
        }
        const ports = [...open].sort();
        return {
          resourceId: `projects/${inv.projectId}/global/firewalls/${f.name}`, resourceName: f.name,
          status: ports.length ? 'fail' : 'pass',
          message: ports.length ? `${f.name} allows port ${ports.join(', ')} from the internet.` : `${f.name} does not expose SSH/RDP to the internet.`,
        };
      });
    },
  },
  {
    id: 'gcp.instance_public_ip',
    provider: 'gcp',
    title: 'VM instances without external IPs',
    description: 'Instances with external IPs are reachable from the internet. That should be intentional.',
    severity: 'Low',
    remediation: 'Remove the external IP and reach the instance through a load balancer, Cloud NAT or IAP.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.5'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.instances) return null;
      return inv.instances.map<ResourceResult>(i => ({
        resourceId: `projects/${inv.projectId}/zones/${i.zone}/instances/${i.name}`, resourceName: i.name,
        status: i.externalIps.length ? 'fail' : 'pass',
        message: i.externalIps.length ? `${i.name} has external IP ${i.externalIps.join(', ')}.` : `${i.name} has no external IP.`,
      }));
    },
  },
  {
    id: 'gcp.sql_public',
    provider: 'gcp',
    title: 'Cloud SQL not open to the internet',
    description: 'Cloud SQL instances should not authorize 0.0.0.0/0.',
    severity: 'High',
    remediation: 'Remove 0.0.0.0/0 from authorized networks; use private IP or the Cloud SQL Auth Proxy.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.5'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.sqlInstances) return null;
      return inv.sqlInstances.map<ResourceResult>(s => {
        const open = s.publicIpEnabled && s.authorizedNetworks.some(isOpenSource);
        return {
          resourceId: `projects/${inv.projectId}/instances/${s.name}`, resourceName: s.name,
          status: open ? 'fail' : 'pass',
          message: open ? `${s.name} accepts connections from any IP address.` : `${s.name} is not open to the internet.`,
        };
      });
    },
  },
  {
    id: 'gcp.sql_backups',
    provider: 'gcp',
    title: 'Cloud SQL automated backups',
    description: 'Automated backups allow recovery after data loss.',
    severity: 'Medium',
    remediation: 'Edit the instance > Backups and enable automated backups.',
    controls: { SOC2: ['A1.2'] },
    evaluate: inv => {
      if (!inv.sqlInstances) return null;
      return inv.sqlInstances.map<ResourceResult>(s => ({
        resourceId: `projects/${inv.projectId}/instances/${s.name}`, resourceName: s.name,
        status: s.backupsEnabled ? 'pass' : 'fail',
        message: s.backupsEnabled ? `${s.name} has automated backups.` : `${s.name} has no automated backups.`,
      }));
    },
  },
  {
    id: 'gcp.sql_ssl',
    provider: 'gcp',
    title: 'Cloud SQL requires SSL',
    description: 'Connections to the database should be encrypted in transit.',
    severity: 'Medium',
    remediation: 'Edit the instance > Connections > Security and set SSL mode to "Allow only SSL connections".',
    controls: { SOC2: ['CC6.7'], PCI: ['4.2.1', '2.2.7'] },
    evaluate: inv => {
      if (!inv.sqlInstances) return null;
      return inv.sqlInstances.map<ResourceResult>(s => ({
        resourceId: `projects/${inv.projectId}/instances/${s.name}`, resourceName: s.name,
        status: s.sslRequired ? 'pass' : 'fail',
        message: s.sslRequired ? `${s.name} only accepts encrypted connections.` : `${s.name} accepts unencrypted connections.`,
      }));
    },
  },
];
