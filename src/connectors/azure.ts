import { DefaultAzureCredential } from '@azure/identity';
import type { AzureInventory } from '@/checks/azure';
import { CollectResult, section } from './common';

/**
 * Read-only Azure collector using DefaultAzureCredential (service principal
 * via AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET, managed
 * identity, or `az login`). Assign the "Reader" and "Security Reader" roles
 * on the subscription.
 */

export function azureSubscriptionId(): string | undefined {
  return process.env.AZURE_SUBSCRIPTION_ID || undefined;
}

export function azureConfigured(): boolean {
  return !!azureSubscriptionId();
}

const ARM = 'https://management.azure.com';

type Json = Record<string, unknown>;

function makeClient() {
  const credential = new DefaultAzureCredential();
  let cached: { token: string; expiresOn: number } | null = null;

  async function token() {
    if (cached && cached.expiresOn - Date.now() > 60_000) return cached.token;
    const t = await credential.getToken(`${ARM}/.default`);
    if (!t) throw new Error('Could not obtain an Azure access token.');
    cached = { token: t.token, expiresOn: t.expiresOnTimestamp };
    return t.token;
  }

  async function get(url: string): Promise<Json> {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await token()}` } });
    const body = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      const err = body.error as { code?: string; message?: string } | undefined;
      throw new Error(`${res.status} ${err?.code ?? ''} ${err?.message ?? res.statusText}`.trim());
    }
    return body;
  }

  /** Follows nextLink pagination and returns every item in `value`. */
  async function list<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | undefined = path.startsWith('http') ? path : `${ARM}${path}`;
    while (url) {
      const page = await get(url);
      out.push(...((page.value as T[] | undefined) ?? []));
      url = page.nextLink as string | undefined;
    }
    return out;
  }

  return { list };
}

interface ArmResource<P> { id: string; name: string; properties?: P }

export async function collectAzure(): Promise<CollectResult<AzureInventory>> {
  const subscriptionId = azureSubscriptionId();
  if (!subscriptionId) throw new Error('AZURE_SUBSCRIPTION_ID is not set.');
  const { list } = makeClient();
  const sub = `/subscriptions/${encodeURIComponent(subscriptionId)}`;
  const errors: string[] = [];
  const inventory: AzureInventory = { subscriptionId, collectedAt: new Date().toISOString() };

  inventory.storageAccounts = await section('Storage accounts', errors, async () => {
    const items = await list<ArmResource<{ allowBlobPublicAccess?: boolean; supportsHttpsTrafficOnly?: boolean; minimumTlsVersion?: string }>>(
      `${sub}/providers/Microsoft.Storage/storageAccounts?api-version=2023-01-01`);
    return items.map(s => ({
      id: s.id, name: s.name,
      allowBlobPublicAccess: !!s.properties?.allowBlobPublicAccess,
      httpsOnly: s.properties?.supportsHttpsTrafficOnly !== false,
      minTlsVersion: s.properties?.minimumTlsVersion,
    }));
  });

  inventory.networkSecurityGroups = await section('Network security groups', errors, async () => {
    type Rule = ArmResource<{
      direction?: string; access?: string; protocol?: string;
      sourceAddressPrefix?: string; sourceAddressPrefixes?: string[];
      destinationPortRange?: string; destinationPortRanges?: string[];
    }>;
    const items = await list<ArmResource<{ securityRules?: Rule[] }>>(`${sub}/providers/Microsoft.Network/networkSecurityGroups?api-version=2023-09-01`);
    return items.map(n => ({
      id: n.id, name: n.name,
      rules: (n.properties?.securityRules ?? []).map(r => {
        const p = r.properties ?? {};
        return {
          name: r.name, direction: p.direction ?? '', access: p.access ?? '', protocol: p.protocol ?? '*',
          sources: [p.sourceAddressPrefix, ...(p.sourceAddressPrefixes ?? [])].filter((x): x is string => !!x),
          ports: [p.destinationPortRange, ...(p.destinationPortRanges ?? [])].filter((x): x is string => !!x),
        };
      }),
    }));
  });

  inventory.publicIps = await section('Public IP addresses', errors, async () => {
    const items = await list<ArmResource<{ ipAddress?: string; ipConfiguration?: { id?: string } }>>(
      `${sub}/providers/Microsoft.Network/publicIPAddresses?api-version=2023-09-01`);
    return items.map(p => ({ id: p.id, name: p.name, ipAddress: p.properties?.ipAddress, attachedTo: p.properties?.ipConfiguration?.id }));
  });

  inventory.sqlServers = await section('Azure SQL', errors, async () => {
    const servers = await list<ArmResource<unknown>>(`${sub}/providers/Microsoft.Sql/servers?api-version=2021-11-01`);
    const out: NonNullable<AzureInventory['sqlServers']> = [];
    for (const s of servers) {
      const rules = await list<ArmResource<{ startIpAddress?: string; endIpAddress?: string }>>(`${s.id}/firewallRules?api-version=2021-11-01`);
      out.push({
        id: s.id, name: s.name,
        firewallRules: rules.map(r => ({ name: r.name, start: r.properties?.startIpAddress ?? '', end: r.properties?.endIpAddress ?? '' })),
      });
    }
    return out;
  });

  inventory.activityLogExports = await section('Activity Log export', errors, async () =>
    (await list<unknown>(`${sub}/providers/Microsoft.Insights/diagnosticSettings?api-version=2021-05-01-preview`)).length);

  inventory.keyVaults = await section('Key Vaults', errors, async () => {
    const items = await list<ArmResource<{ enableSoftDelete?: boolean; enablePurgeProtection?: boolean }>>(
      `${sub}/providers/Microsoft.KeyVault/vaults?api-version=2023-07-01`);
    // Soft delete is mandatory on all vaults since 2020; an absent flag means enabled.
    return items.map(v => ({ id: v.id, name: v.name, softDelete: v.properties?.enableSoftDelete !== false, purgeProtection: !!v.properties?.enablePurgeProtection }));
  });

  inventory.defenderPlans = await section('Defender for Cloud plans', errors, async () => {
    const items = await list<ArmResource<{ pricingTier?: string }>>(`${sub}/providers/Microsoft.Security/pricings?api-version=2024-01-01`);
    return items.map(p => ({ name: p.name, tier: p.properties?.pricingTier ?? 'Free' }));
  });

  const anything = [inventory.storageAccounts, inventory.networkSecurityGroups, inventory.publicIps, inventory.sqlServers,
    inventory.activityLogExports, inventory.keyVaults, inventory.defenderPlans].some(x => x !== undefined);
  if (!anything) throw new Error(`Could not read anything from Azure subscription ${subscriptionId}. ${errors[0] ?? ''}`.trim());
  return { inventory, errors, account: subscriptionId };
}
