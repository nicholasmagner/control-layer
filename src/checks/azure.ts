import { adminPortsInRange, coversTcp, isOpenSource, parsePortRange } from './network';
import { CheckDef, ResourceResult } from './types';

export interface AzureInventory {
  subscriptionId: string;
  collectedAt: string;
  storageAccounts?: { id: string; name: string; allowBlobPublicAccess: boolean; httpsOnly: boolean; minTlsVersion?: string }[];
  networkSecurityGroups?: {
    id: string;
    name: string;
    rules: { name: string; direction: string; access: string; protocol: string; sources: string[]; ports: string[] }[];
  }[];
  publicIps?: { id: string; name: string; ipAddress?: string; attachedTo?: string }[];
  sqlServers?: { id: string; name: string; firewallRules: { name: string; start: string; end: string }[] }[];
  /** Number of subscription-level diagnostic settings exporting the Activity Log. */
  activityLogExports?: number;
  keyVaults?: { id: string; name: string; softDelete: boolean; purgeProtection: boolean }[];
  defenderPlans?: { name: string; tier: string }[];
}

const TLS_OK = new Set(['TLS1_2', 'TLS1_3']);

export const AZURE_CHECKS: CheckDef<AzureInventory>[] = [
  {
    id: 'azure.storage_public_access',
    provider: 'azure',
    title: 'Storage accounts block public blob access',
    description: 'Storage accounts should not allow anonymous public read access to blobs.',
    severity: 'High',
    remediation: 'Open the storage account > Configuration and set "Allow Blob anonymous access" to Disabled.',
    controls: { SOC2: ['CC6.1', 'CC6.6'], CMMC: ['AC.L1-3.1.22'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.storageAccounts) return null;
      return inv.storageAccounts.map<ResourceResult>(s => ({
        resourceId: s.id, resourceName: s.name,
        status: s.allowBlobPublicAccess ? 'fail' : 'pass',
        message: s.allowBlobPublicAccess ? `${s.name} allows anonymous blob access.` : `${s.name} blocks anonymous blob access.`,
      }));
    },
  },
  {
    id: 'azure.storage_secure_transfer',
    provider: 'azure',
    title: 'Storage requires HTTPS and TLS 1.2+',
    description: 'Storage accounts should reject unencrypted HTTP and outdated TLS versions.',
    severity: 'Medium',
    remediation: 'Open the storage account > Configuration: enable "Secure transfer required" and set "Minimum TLS version" to 1.2.',
    controls: { SOC2: ['CC6.7'], PCI: ['4.2.1'] },
    evaluate: inv => {
      if (!inv.storageAccounts) return null;
      return inv.storageAccounts.map<ResourceResult>(s => {
        const tlsOk = !!s.minTlsVersion && TLS_OK.has(s.minTlsVersion);
        const ok = s.httpsOnly && tlsOk;
        return {
          resourceId: s.id, resourceName: s.name,
          status: ok ? 'pass' : 'fail',
          message: ok ? `${s.name} requires HTTPS with ${s.minTlsVersion}.`
            : `${s.name}: HTTPS ${s.httpsOnly ? 'required' : 'not required'}, minimum TLS ${s.minTlsVersion ?? 'unset'}.`,
        };
      });
    },
  },
  {
    id: 'azure.nsg_open_admin',
    provider: 'azure',
    title: 'No SSH/RDP open to the internet',
    description: 'Network security groups should not allow SSH (22) or RDP (3389) from any source.',
    severity: 'High',
    remediation: 'Edit the inbound rule to allow only known IP ranges, or remove it and use Azure Bastion or just-in-time VM access.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.1', 'AC.L1-3.1.20'], PCI: ['1.3.1'] },
    evaluate: inv => {
      if (!inv.networkSecurityGroups) return null;
      return inv.networkSecurityGroups.map<ResourceResult>(n => {
        const open = new Set<number>();
        for (const r of n.rules) {
          if (r.direction !== 'Inbound' || r.access !== 'Allow' || !coversTcp(r.protocol)) continue;
          if (!r.sources.some(isOpenSource)) continue;
          (r.ports.length ? r.ports : ['*']).forEach(p => adminPortsInRange(parsePortRange(p)).forEach(x => open.add(x)));
        }
        const ports = [...open].sort();
        return {
          resourceId: n.id, resourceName: n.name,
          status: ports.length ? 'fail' : 'pass',
          message: ports.length ? `${n.name} allows port ${ports.join(', ')} from the internet.` : `${n.name} does not expose SSH/RDP to the internet.`,
        };
      });
    },
  },
  {
    id: 'azure.public_ip',
    provider: 'azure',
    title: 'Review resources with public IPs',
    description: 'Public IP addresses attached to resources make them reachable from the internet. That should be intentional.',
    severity: 'Low',
    remediation: 'Detach the public IP if the resource does not need direct internet access; use a load balancer, Application Gateway or Bastion instead.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.5'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.publicIps) return null;
      return inv.publicIps.map<ResourceResult>(p => ({
        resourceId: p.id, resourceName: p.name,
        status: p.attachedTo ? 'fail' : 'pass',
        message: p.attachedTo ? `${p.name} (${p.ipAddress ?? 'dynamic'}) is attached to ${p.attachedTo.split('/').slice(-3).join('/')}.` : `${p.name} is not attached to anything.`,
      }));
    },
  },
  {
    id: 'azure.sql_open_firewall',
    provider: 'azure',
    title: 'Azure SQL not open to the internet',
    description: 'SQL server firewall rules should not allow the entire IPv4 range.',
    severity: 'High',
    remediation: 'Delete firewall rules covering 0.0.0.0-255.255.255.255; use private endpoints or specific client IPs.',
    controls: { SOC2: ['CC6.6'], CMMC: ['SC.L1-3.13.5'], PCI: ['1.4.1'] },
    evaluate: inv => {
      if (!inv.sqlServers) return null;
      return inv.sqlServers.map<ResourceResult>(s => {
        const wide = s.firewallRules.filter(r => r.start === '0.0.0.0' && r.end === '255.255.255.255');
        return {
          resourceId: s.id, resourceName: s.name,
          status: wide.length ? 'fail' : 'pass',
          message: wide.length ? `${s.name} has a firewall rule allowing every IP address (${wide.map(r => r.name).join(', ')}).` : `${s.name} does not allow every IP address.`,
        };
      });
    },
  },
  {
    id: 'azure.activity_log_export',
    provider: 'azure',
    title: 'Activity Log exported for retention',
    description: 'The Azure Activity Log is kept for only 90 days unless exported to a Log Analytics workspace or storage account.',
    severity: 'Medium',
    remediation: 'In Monitor > Activity log > Export Activity Logs, add a diagnostic setting that sends all categories to Log Analytics or storage with 1-year retention.',
    controls: { SOC2: ['CC7.2'], PCI: ['10.5.1', '10.2.1'] },
    evaluate: inv => {
      if (inv.activityLogExports === undefined) return null;
      const ok = inv.activityLogExports > 0;
      return [{
        resourceId: `/subscriptions/${inv.subscriptionId}/diagnosticSettings`, resourceName: `Subscription ${inv.subscriptionId}`,
        status: ok ? 'pass' : 'fail',
        message: ok ? `Activity Log is exported by ${inv.activityLogExports} diagnostic setting(s).` : 'Activity Log is not exported; it is kept for only 90 days.',
      }];
    },
  },
  {
    id: 'azure.keyvault_protection',
    provider: 'azure',
    title: 'Key Vaults have purge protection',
    description: 'Soft delete and purge protection prevent keys and secrets from being permanently deleted by mistake or by an attacker.',
    severity: 'Medium',
    remediation: 'Open the Key Vault > Properties and enable purge protection (soft delete is on by default for new vaults).',
    controls: { SOC2: ['CC6.1', 'A1.2'], PCI: ['3.7.1'] },
    evaluate: inv => {
      if (!inv.keyVaults) return null;
      return inv.keyVaults.map<ResourceResult>(v => {
        const ok = v.softDelete && v.purgeProtection;
        return {
          resourceId: v.id, resourceName: v.name,
          status: ok ? 'pass' : 'fail',
          message: ok ? `${v.name} has soft delete and purge protection.` : `${v.name} is missing ${!v.softDelete ? 'soft delete' : 'purge protection'}.`,
        };
      });
    },
  },
  {
    id: 'azure.defender_servers',
    provider: 'azure',
    title: 'Defender for Servers enabled',
    description: 'Microsoft Defender for Servers provides malware protection and vulnerability assessment for virtual machines.',
    severity: 'Medium',
    remediation: 'In Microsoft Defender for Cloud > Environment settings, select the subscription and turn on the "Servers" plan.',
    controls: { SOC2: ['CC6.8', 'CC7.1'], CMMC: ['SI.L1-3.14.2', 'SI.L1-3.14.4', 'SI.L1-3.14.5'], PCI: ['5.2.1', '11.3.1'] },
    evaluate: inv => {
      if (!inv.defenderPlans) return null;
      const plan = inv.defenderPlans.find(p => p.name === 'VirtualMachines');
      const ok = plan?.tier === 'Standard';
      return [{
        resourceId: `/subscriptions/${inv.subscriptionId}/pricings/VirtualMachines`, resourceName: 'Defender for Servers',
        status: ok ? 'pass' : 'fail',
        message: ok ? 'Defender for Servers is enabled.' : 'Defender for Servers is not enabled (Free tier).',
      }];
    },
  },
];
