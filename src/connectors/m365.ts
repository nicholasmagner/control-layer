import { AzureCliCredential, ClientSecretCredential, type TokenCredential } from '@azure/identity';
import type { DirectoryUser, IdentityInventory } from '@/checks/identity';
import { CollectResult, describeError, section } from './common';
import type { M365Connection } from './config';

/**
 * Read-only Microsoft 365 / Microsoft Entra ID collector (Microsoft Graph).
 * Signs in with `az login` or an app registration with the application
 * permissions User.Read.All, AuditLog.Read.All, Policy.Read.All and
 * RoleManagement.Read.Directory. Sign-in activity and MFA registration
 * reports need a Microsoft Entra ID P1 or P2 license; without one those checks
 * are reported as "not evaluated".
 */

const GRAPH = 'https://graph.microsoft.com/v1.0';
const GLOBAL_ADMIN_TEMPLATE = '62e90394-69f5-4237-9190-012177145e10';

type Json = Record<string, unknown>;

export function m365Credential(conn: Pick<M365Connection, 'method' | 'tenantId' | 'app'>): TokenCredential {
  if (conn.app) return new ClientSecretCredential(conn.app.tenantId, conn.app.clientId, conn.app.clientSecret);
  return new AzureCliCredential(conn.tenantId ? { tenantId: conn.tenantId } : {});
}

export function graphClient(credential: TokenCredential) {
  let cached: { token: string; expiresOn: number } | null = null;
  async function token() {
    if (cached && cached.expiresOn - Date.now() > 60_000) return cached.token;
    const t = await credential.getToken('https://graph.microsoft.com/.default');
    if (!t) throw new Error('Could not get a Microsoft Graph access token.');
    cached = { token: t.token, expiresOn: t.expiresOnTimestamp };
    return t.token;
  }
  async function get(url: string): Promise<Json> {
    const res = await fetch(url.startsWith('http') ? url : `${GRAPH}${url}`, { headers: { Authorization: `Bearer ${await token()}`, ConsistencyLevel: 'eventual' } });
    const body = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok) {
      const err = body.error as { code?: string; message?: string } | undefined;
      throw new Error(`${err?.code ?? `HTTP ${res.status}`}: ${err?.message ?? 'request failed'}`);
    }
    return body;
  }
  async function list<T = Json>(url: string, max = 50_000): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = url;
    while (next && out.length < max) {
      const page = await get(next);
      out.push(...((page.value as T[] | undefined) ?? []));
      next = page['@odata.nextLink'] as string | undefined;
    }
    return out;
  }
  return { get, list };
}

type GraphUser = {
  id: string;
  displayName?: string;
  userPrincipalName: string;
  mail?: string | null;
  proxyAddresses?: string[];
  accountEnabled?: boolean;
  userType?: string;
  createdDateTime?: string;
  signInActivity?: { lastSignInDateTime?: string | null; lastNonInteractiveSignInDateTime?: string | null };
};

const latest = (...dates: (string | null | undefined)[]) =>
  dates.filter((d): d is string => !!d).sort().at(-1) ?? null;

export async function collectM365(conn: M365Connection): Promise<CollectResult<IdentityInventory>> {
  const graph = graphClient(m365Credential(conn));
  const errors: string[] = [];
  const org = (await graph.list<{ displayName?: string; verifiedDomains?: { name: string; isDefault?: boolean }[] }>('/organization'))[0];
  const tenant = org?.verifiedDomains?.find(d => d.isDefault)?.name ?? org?.displayName ?? conn.label;
  const inventory: IdentityInventory = { tenant, collectedAt: new Date().toISOString() };

  const base = 'id,displayName,userPrincipalName,mail,proxyAddresses,accountEnabled,userType,createdDateTime';
  let users: GraphUser[] | undefined;
  let signInsReadable = true;
  try {
    users = await graph.list<GraphUser>(`/users?$select=${base},signInActivity&$top=500`);
  } catch (err) {
    signInsReadable = false;
    errors.push(`Sign-in activity: ${describeError(err)} (needs AuditLog.Read.All and a Microsoft Entra ID P1 or P2 license).`);
    users = await section('Users', errors, () => graph.list<GraphUser>(`/users?$select=${base}&$top=999`));
  }

  const registered = await section('MFA registration', errors, async () => {
    const rows = await graph.list<{ id: string; isMfaRegistered?: boolean }>('/reports/authenticationMethods/userRegistrationDetails?$top=999');
    return new Map(rows.map(r => [r.id, !!r.isMfaRegistered]));
  });

  const admins = await section('Global administrators', errors, async () => {
    try {
      const members = await graph.list<{ id: string }>(`/directoryRoles(roleTemplateId='${GLOBAL_ADMIN_TEMPLATE}')/members?$select=id`);
      return new Set(members.map(m => m.id));
    } catch (err) {
      if (/Request_ResourceNotFound|NotFound/i.test(String((err as Error).message))) return new Set<string>();
      throw err;
    }
  });

  if (users && admins) {
    inventory.users = users.map<DirectoryUser>(u => ({
      id: u.id,
      email: (u.userPrincipalName || u.mail || '').toLowerCase(),
      aliases: [u.mail, ...(u.proxyAddresses ?? []).map(a => a.replace(/^smtp:/i, ''))].filter((a): a is string => !!a).map(a => a.toLowerCase()),
      name: u.displayName ?? u.userPrincipalName,
      isAdmin: admins.has(u.id),
      active: u.accountEnabled !== false,
      guest: u.userType === 'Guest',
      mfaRegistered: registered ? registered.get(u.id) ?? false : undefined,
      lastSignIn: signInsReadable ? latest(u.signInActivity?.lastSignInDateTime, u.signInActivity?.lastNonInteractiveSignInDateTime) : undefined,
      createdAt: u.createdDateTime,
    }));
  }

  inventory.mfaEnforced = await section('MFA policy', errors, async () => {
    const defaults = await graph.get('/policies/identitySecurityDefaultsEnforcementPolicy');
    if (defaults.isEnabled === true) return { enforced: true, how: 'security defaults are on' };
    let policies: Json[];
    try {
      policies = await graph.list<Json>('/identity/conditionalAccess/policies');
    } catch (err) {
      errors.push(`Conditional Access: ${describeError(err)}`);
      return { enforced: false, how: 'security defaults are off and Conditional Access policies could not be read' };
    }
    const mfaForAll = policies.find(p => {
      const users = (p.conditions as { users?: { includeUsers?: string[] } } | undefined)?.users;
      const apps = (p.conditions as { applications?: { includeApplications?: string[] } } | undefined)?.applications;
      const grant = p.grantControls as { builtInControls?: string[]; authenticationStrength?: unknown } | null | undefined;
      return p.state === 'enabled' && users?.includeUsers?.includes('All') && apps?.includeApplications?.includes('All')
        && (grant?.builtInControls?.includes('mfa') || !!grant?.authenticationStrength);
    });
    return mfaForAll
      ? { enforced: true, how: `Conditional Access policy "${String(mfaForAll.displayName)}" requires MFA for all users` }
      : { enforced: false, how: 'security defaults are off and no enabled Conditional Access policy requires MFA for all users and apps' };
  });

  return { inventory, errors, account: tenant };
}

/** The tenant(s) the signed-in identity belongs to, for the connect dialog. */
export async function m365Tenants(conn: Pick<M365Connection, 'method' | 'tenantId' | 'app'>): Promise<{ id: string; label: string }[]> {
  const orgs = await graphClient(m365Credential(conn)).list<{ id: string; displayName?: string; verifiedDomains?: { name: string; isDefault?: boolean }[] }>('/organization');
  return orgs.map(o => {
    const domain = o.verifiedDomains?.find(d => d.isDefault)?.name;
    return { id: o.id, label: `${o.displayName ?? o.id}${domain ? ` (${domain})` : ''}` };
  });
}
