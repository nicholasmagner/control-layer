import { Client, type Entry } from 'ldapts';
import type { AdInventory, DirectoryUser } from '@/checks/identity';
import { CollectResult, section } from './common';
import type { AdConnection } from './config';

/**
 * Read-only Active Directory collector over LDAP. Binds with a regular
 * (non-admin) domain account: every authenticated user can read the
 * attributes used here. Use ldaps:// (port 636) or ldap:// with StartTLS so
 * the password is never sent in clear text.
 */

const UAC_DISABLED = 0x2;
const UAC_PASSWD_NOTREQD = 0x20;
const UAC_DONT_EXPIRE = 0x10000;
const FILETIME_EPOCH_DIFF_MS = 11_644_473_600_000;

/** Windows FILETIME (100 ns since 1601) to ISO time; null for 0 / never. */
export function fileTimeToIso(v: unknown): string | null {
  const s = Array.isArray(v) ? v[0] : v;
  if (s === undefined || s === null || s === '' || s === '0' || s === '9223372036854775807') return null;
  try {
    const ms = Number(BigInt(String(s)) / BigInt(10_000)) - FILETIME_EPOCH_DIFF_MS;
    return ms > 0 ? new Date(ms).toISOString() : null;
  } catch {
    return null;
  }
}

/** AD GeneralizedTime (20240131120000.0Z) to ISO time. */
export function generalizedTimeToIso(v: unknown): string | undefined {
  const s = String(Array.isArray(v) ? v[0] : v ?? '');
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/.exec(s);
  return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6])).toISOString() : undefined;
}

const first = (v: unknown) => String(Array.isArray(v) ? v[0] ?? '' : v ?? '');
const int = (v: unknown) => Number.parseInt(first(v), 10) || 0;

/** Domain name (corp.example.com) from a base DN (DC=corp,DC=example,DC=com). */
export const dnToDomain = (dn: string) => dn.split(',').filter(p => /^dc=/i.test(p.trim())).map(p => p.trim().slice(3)).join('.');

export function adClient(conn: Pick<AdConnection, 'url' | 'caCert'>) {
  return new Client({
    url: conn.url,
    timeout: 30_000,
    connectTimeout: 10_000,
    tlsOptions: conn.caCert ? { ca: [conn.caCert] } : undefined,
  });
}

/** Connects, upgrades to TLS when asked, binds, and returns the base DN. */
export async function adConnect(conn: AdConnection): Promise<{ client: Client; baseDn: string }> {
  const client = adClient(conn);
  if (conn.startTls && conn.url.startsWith('ldap://')) await client.startTLS(conn.caCert ? { ca: [conn.caCert] } : {});
  await client.bind(conn.username, conn.password);
  let baseDn = conn.baseDn;
  if (!baseDn) {
    const { searchEntries } = await client.search('', { scope: 'base', attributes: ['defaultNamingContext'] });
    baseDn = first(searchEntries[0]?.defaultNamingContext);
    if (!baseDn) throw new Error('Could not find the domain. Enter the base DN (e.g. DC=corp,DC=example,DC=com).');
  }
  return { client, baseDn };
}

export async function collectAd(conn: AdConnection): Promise<CollectResult<AdInventory>> {
  const { client, baseDn } = await adConnect(conn);
  const errors: string[] = [];
  const domain = dnToDomain(baseDn) || baseDn;
  const inventory: AdInventory = { tenant: domain, collectedAt: new Date().toISOString() };
  try {
    inventory.passwordPolicy = await section('Password policy', errors, async () => {
      const { searchEntries } = await client.search(baseDn, {
        scope: 'base', attributes: ['minPwdLength', 'pwdProperties', 'lockoutThreshold', 'maxPwdAge'],
      });
      const d = searchEntries[0];
      if (!d) throw new Error('domain object not readable');
      const maxAge = first(d.maxPwdAge);
      const maxAgeDays = maxAge && maxAge !== '0' && !maxAge.startsWith('-9223372036854775808')
        ? Math.round(Math.abs(Number(BigInt(maxAge) / BigInt(10_000_000))) / 86_400) : null;
      return { minLength: int(d.minPwdLength), complexity: (int(d.pwdProperties) & 1) === 1, lockoutThreshold: int(d.lockoutThreshold), maxAgeDays };
    });

    const admins = await section('Domain Admins', errors, async () => {
      const { searchEntries: groups } = await client.search(baseDn, {
        filter: '(&(objectCategory=group)(|(sAMAccountName=Domain Admins)(sAMAccountName=Enterprise Admins)))',
        attributes: ['distinguishedName'],
      });
      const dns = new Set<string>();
      for (const g of groups) {
        const { searchEntries } = await client.search(baseDn, {
          // 1.2.840.113556.1.4.1941 = LDAP_MATCHING_RULE_IN_CHAIN: nested group members too.
          filter: `(&(objectCategory=person)(objectClass=user)(memberOf:1.2.840.113556.1.4.1941:=${escapeDn(g.dn)}))`,
          attributes: ['distinguishedName'], paged: { pageSize: 500 },
        });
        searchEntries.forEach(e => dns.add(e.dn.toLowerCase()));
      }
      return dns;
    });

    const users = await section('Users', errors, async () => {
      const { searchEntries } = await client.search(baseDn, {
        filter: '(&(objectCategory=person)(objectClass=user))',
        attributes: ['sAMAccountName', 'userPrincipalName', 'mail', 'displayName', 'userAccountControl', 'lastLogonTimestamp', 'whenCreated', 'proxyAddresses'],
        paged: { pageSize: 500 }, sizeLimit: 0,
      });
      return searchEntries;
    });

    if (users && admins) {
      const list = users.filter(u => !/^(krbtgt|guest|defaultaccount|wdagutilityaccount)$/i.test(first(u.sAMAccountName)));
      inventory.users = list.map<DirectoryUser>(u => toUser(u, domain, admins));
      inventory.flags = list
        .filter(u => (int(u.userAccountControl) & UAC_DISABLED) === 0)
        .map(u => ({
          email: toUser(u, domain, admins).email,
          passwordNeverExpires: (int(u.userAccountControl) & UAC_DONT_EXPIRE) !== 0,
          passwordNotRequired: (int(u.userAccountControl) & UAC_PASSWD_NOTREQD) !== 0,
        }));
    }
  } finally {
    await client.unbind().catch(() => undefined);
  }
  return { inventory, errors, account: domain };
}

function toUser(u: Entry, domain: string, admins: Set<string>): DirectoryUser {
  const sam = first(u.sAMAccountName);
  const upn = first(u.userPrincipalName).toLowerCase();
  const mail = first(u.mail).toLowerCase();
  const proxies = (Array.isArray(u.proxyAddresses) ? u.proxyAddresses : [u.proxyAddresses]).map(String).filter(a => /^smtp:/i.test(a)).map(a => a.slice(5).toLowerCase());
  return {
    id: u.dn,
    email: mail || upn || `${sam}@${domain}`.toLowerCase(),
    aliases: [upn, mail, ...proxies].filter(Boolean),
    name: first(u.displayName) || sam,
    isAdmin: admins.has(u.dn.toLowerCase()),
    active: (int(u.userAccountControl) & UAC_DISABLED) === 0,
    lastSignIn: fileTimeToIso(u.lastLogonTimestamp),
    createdAt: generalizedTimeToIso(u.whenCreated),
  };
}

/** Escapes a DN for use as a value inside an LDAP filter. */
function escapeDn(dn: string) {
  return dn.replace(/[\\*()\u0000]/g, c => `\\${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
}

/** Checks the connection details work before saving them. */
export async function validateAd(conn: AdConnection): Promise<{ id: string; label: string }> {
  const { client, baseDn } = await adConnect(conn);
  await client.unbind().catch(() => undefined);
  return { id: baseDn, label: dnToDomain(baseDn) || baseDn };
}
