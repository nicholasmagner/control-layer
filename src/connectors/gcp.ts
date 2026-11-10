import { GoogleAuth } from 'google-auth-library';
import type { GcpInventory } from '@/checks/gcp';
import { CollectResult, section } from './common';
import type { GcpConnection } from './config';

const SCOPES = ['https://www.googleapis.com/auth/cloud-platform.read-only'];

/** Service account key from the connection, or Application Default Credentials (gcloud sign-in). */
export function gcpAuth(conn: Pick<GcpConnection, 'keyFile'>) {
  return conn.keyFile ? new GoogleAuth({ credentials: conn.keyFile, scopes: SCOPES }) : new GoogleAuth({ scopes: SCOPES });
}

/**
 * Read-only Google Cloud collector using Application Default Credentials
 * (GOOGLE_APPLICATION_CREDENTIALS key file, gcloud login, or an attached
 * service account). Grant the scanning identity "Security Reviewer"
 * (roles/iam.securityReviewer) and "Viewer" (roles/viewer) on the project.
 */

type Json = Record<string, unknown>;

interface Binding { role: string; members?: string[] }

async function getAll<T>(auth: GoogleAuth, url: string, key: string): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const sep = url.includes('?') ? '&' : '?';
    const res = await auth.request<Json>({ url: pageToken ? `${url}${sep}pageToken=${encodeURIComponent(pageToken)}` : url });
    out.push(...((res.data[key] as T[] | undefined) ?? []));
    pageToken = res.data.nextPageToken as string | undefined;
  } while (pageToken);
  return out;
}

export async function collectGcp(conn: GcpConnection): Promise<CollectResult<GcpInventory>> {
  const projectId = conn.projectId;
  const auth = gcpAuth(conn);
  const errors: string[] = [];
  const inventory: GcpInventory = { projectId, collectedAt: new Date().toISOString() };
  const p = encodeURIComponent(projectId);

  const policy = await section('Project IAM policy', errors, async () => {
    const res = await auth.request<{ bindings?: Binding[]; auditConfigs?: { service: string; auditLogConfigs?: { logType: string }[] }[] }>({
      url: `https://cloudresourcemanager.googleapis.com/v1/projects/${p}:getIamPolicy`,
      method: 'POST',
      data: { options: { requestedPolicyVersion: 3 } },
    });
    return res.data;
  });
  if (policy) {
    inventory.iamBindings = (policy.bindings ?? []).map(b => ({ role: b.role, members: b.members ?? [] }));
    inventory.auditConfigs = (policy.auditConfigs ?? []).map(c => ({ service: c.service, logTypes: (c.auditLogConfigs ?? []).map(l => l.logType) }));
  }

  inventory.serviceAccountKeys = await section('Service account keys', errors, async () => {
    const accounts = await getAll<{ email: string; name: string }>(auth, `https://iam.googleapis.com/v1/projects/${p}/serviceAccounts`, 'accounts');
    const keys: NonNullable<GcpInventory['serviceAccountKeys']> = [];
    for (const a of accounts) {
      const res = await auth.request<{ keys?: { name: string; validAfterTime: string }[] }>({
        url: `https://iam.googleapis.com/v1/${a.name}/keys?keyTypes=USER_MANAGED`,
      });
      for (const k of res.data.keys ?? []) keys.push({ account: a.email, keyId: k.name.split('/').pop() ?? k.name, createdAt: k.validAfterTime });
    }
    return keys;
  });

  inventory.buckets = await section('Cloud Storage', errors, async () => {
    const buckets = await getAll<{ name: string; iamConfiguration?: { uniformBucketLevelAccess?: { enabled?: boolean }; publicAccessPrevention?: string } }>(
      auth, `https://storage.googleapis.com/storage/v1/b?project=${p}`, 'items');
    const out: NonNullable<GcpInventory['buckets']> = [];
    for (const b of buckets) {
      let publicMembers: string[] = [];
      try {
        const res = await auth.request<{ bindings?: Binding[] }>({ url: `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(b.name)}/iam` });
        publicMembers = [...new Set((res.data.bindings ?? []).flatMap(x => x.members ?? []).filter(m => m === 'allUsers' || m === 'allAuthenticatedUsers'))];
      } catch { /* cannot read bucket IAM: leave as private rather than guess */ }
      out.push({
        name: b.name, publicMembers,
        uniformAccess: !!b.iamConfiguration?.uniformBucketLevelAccess?.enabled,
        publicAccessPrevention: b.iamConfiguration?.publicAccessPrevention,
      });
    }
    return out;
  });

  inventory.instances = await section('Compute Engine instances', errors, async () => {
    const out: NonNullable<GcpInventory['instances']> = [];
    let pageToken: string | undefined;
    do {
      const res = await auth.request<{ items?: Record<string, { instances?: { name: string; networkInterfaces?: { accessConfigs?: { natIP?: string }[] }[] }[] }>; nextPageToken?: string }>({
        url: `https://compute.googleapis.com/compute/v1/projects/${p}/aggregated/instances${pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : ''}`,
      });
      for (const [zoneKey, scoped] of Object.entries(res.data.items ?? {})) {
        for (const i of scoped.instances ?? []) {
          const ips = (i.networkInterfaces ?? []).flatMap(n => (n.accessConfigs ?? []).map(a => a.natIP).filter((x): x is string => !!x));
          out.push({ name: i.name, zone: zoneKey.replace('zones/', ''), externalIps: ips });
        }
      }
      pageToken = res.data.nextPageToken;
    } while (pageToken);
    return out;
  });

  inventory.firewalls = await section('VPC firewall rules', errors, async () => {
    const rules = await getAll<{ name: string; direction?: string; disabled?: boolean; sourceRanges?: string[]; allowed?: { IPProtocol: string; ports?: string[] }[] }>(
      auth, `https://compute.googleapis.com/compute/v1/projects/${p}/global/firewalls`, 'items');
    return rules.map(r => ({
      name: r.name, direction: r.direction ?? 'INGRESS', disabled: !!r.disabled, sourceRanges: r.sourceRanges ?? [],
      allowed: (r.allowed ?? []).map(a => ({ protocol: a.IPProtocol, ports: a.ports ?? [] })),
    }));
  });

  inventory.sqlInstances = await section('Cloud SQL', errors, async () => {
    const instances = await getAll<{
      name: string;
      settings?: {
        ipConfiguration?: { ipv4Enabled?: boolean; authorizedNetworks?: { value: string }[]; requireSsl?: boolean; sslMode?: string };
        backupConfiguration?: { enabled?: boolean };
      };
    }>(auth, `https://sqladmin.googleapis.com/v1/projects/${p}/instances`, 'items');
    return instances.map(i => {
      const ip = i.settings?.ipConfiguration;
      return {
        name: i.name,
        publicIpEnabled: !!ip?.ipv4Enabled,
        authorizedNetworks: (ip?.authorizedNetworks ?? []).map(n => n.value),
        backupsEnabled: !!i.settings?.backupConfiguration?.enabled,
        sslRequired: !!ip?.requireSsl || ip?.sslMode === 'ENCRYPTED_ONLY' || ip?.sslMode === 'TRUSTED_CLIENT_CERTIFICATE_REQUIRED',
      };
    });
  });

  const anything = [policy, inventory.serviceAccountKeys, inventory.buckets, inventory.instances, inventory.firewalls, inventory.sqlInstances].some(Boolean);
  if (!anything) throw new Error(`Could not read anything from Google Cloud project ${projectId}. ${errors[0] ?? ''}`.trim());
  return { inventory, errors, account: projectId };
}
