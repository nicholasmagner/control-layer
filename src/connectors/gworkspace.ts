import { JWT } from 'google-auth-library';
import type { DirectoryUser, IdentityInventory } from '@/checks/identity';
import { CollectResult, section } from './common';
import type { GworkspaceConnection } from './config';

/**
 * Read-only Google Workspace collector (Admin SDK Directory API), using a
 * service account with domain-wide delegation that acts as an admin user.
 * Only the read-only user directory scope is requested.
 */

export const GWORKSPACE_SCOPES = ['https://www.googleapis.com/auth/admin.directory.user.readonly'];

type GUser = {
  id: string;
  primaryEmail: string;
  aliases?: string[];
  name?: { fullName?: string };
  isAdmin?: boolean;
  suspended?: boolean;
  archived?: boolean;
  isEnrolledIn2Sv?: boolean;
  isEnforcedIn2Sv?: boolean;
  lastLoginTime?: string;
  creationTime?: string;
};

export function gworkspaceClient(keyFile: Record<string, unknown>, adminEmail: string) {
  return new JWT({
    email: String(keyFile.client_email ?? ''),
    key: String(keyFile.private_key ?? ''),
    scopes: GWORKSPACE_SCOPES,
    subject: adminEmail,
  });
}

export async function listGworkspaceUsers(client: JWT, max = 50_000): Promise<GUser[]> {
  const out: GUser[] = [];
  let pageToken: string | undefined;
  do {
    const url = `https://admin.googleapis.com/admin/directory/v1/users?customer=my_customer&maxResults=500&projection=basic${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const res = await client.request<{ users?: GUser[]; nextPageToken?: string }>({ url });
    out.push(...(res.data.users ?? []));
    pageToken = res.data.nextPageToken;
  } while (pageToken && out.length < max);
  return out;
}

const NEVER = '1970-01-01T00:00:00.000Z';

export async function collectGworkspace(conn: GworkspaceConnection): Promise<CollectResult<IdentityInventory>> {
  const client = gworkspaceClient(conn.keyFile, conn.adminEmail);
  const errors: string[] = [];
  const domain = conn.adminEmail.split('@')[1] ?? conn.label;
  const inventory: IdentityInventory = { tenant: domain, collectedAt: new Date().toISOString() };

  const users = await section('Users', errors, () => listGworkspaceUsers(client));
  if (users) {
    inventory.users = users.filter(u => !u.archived).map<DirectoryUser>(u => ({
      id: u.id,
      email: u.primaryEmail.toLowerCase(),
      aliases: u.aliases,
      name: u.name?.fullName ?? u.primaryEmail,
      isAdmin: !!u.isAdmin,
      active: !u.suspended,
      mfaRegistered: !!u.isEnrolledIn2Sv,
      lastSignIn: u.lastLoginTime && u.lastLoginTime !== NEVER ? u.lastLoginTime : null,
      createdAt: u.creationTime,
    }));
    const active = users.filter(u => !u.suspended && !u.archived);
    const enforced = active.filter(u => u.isEnforcedIn2Sv).length;
    inventory.mfaEnforced = {
      enforced: active.length > 0 && enforced === active.length,
      how: `2-Step Verification is enforced for ${enforced} of ${active.length} active users`,
    };
  }
  return { inventory, errors, account: domain };
}
