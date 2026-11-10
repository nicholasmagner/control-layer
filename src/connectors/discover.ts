import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import type { Provider } from '@/checks/types';
import { awsClientCredentials } from './aws';
import { azureCredential, makeArmClient } from './azure';
import { describeError } from './common';
import { AWS_SIGNIN_PROFILE, type AwsConnection } from './config';
import { gcpAuth } from './gcp';
import { githubCliToken } from './cli';
import { githubClient, githubOrgs } from './github';
import { gworkspaceClient, listGworkspaceUsers } from './gworkspace';
import { m365Tenants } from './m365';

/**
 * After a browser sign-in: which accounts / projects / subscriptions the
 * signed-in identity can see, so the user picks one instead of typing IDs.
 * Also validates keys before they are saved.
 */

export interface Choice { id: string; label: string }

async function awsIdentity(conn: AwsConnection): Promise<Choice> {
  const sts = new STSClient({ region: conn.regions[0] ?? 'us-east-1', ...awsClientCredentials(conn) });
  const me = await sts.send(new GetCallerIdentityCommand({}));
  if (!me.Account) throw new Error('AWS did not return an account ID.');
  const who = me.Arn?.split(':').slice(5).join(':') ?? '';
  return { id: me.Account, label: `${me.Account}${who ? ` (${who})` : ''}` };
}

async function gcpProjects(keyFile?: Record<string, unknown>): Promise<Choice[]> {
  const auth = gcpAuth({ keyFile });
  const out: Choice[] = [];
  let pageToken: string | undefined;
  do {
    const res = await auth.request<{ projects?: { projectId: string; name?: string }[]; nextPageToken?: string }>({
      url: `https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState%3AACTIVE${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`,
    });
    for (const p of res.data.projects ?? []) out.push({ id: p.projectId, label: p.name && p.name !== p.projectId ? `${p.name} (${p.projectId})` : p.projectId });
    pageToken = res.data.nextPageToken;
  } while (pageToken && out.length < 500);
  return out;
}

async function azureSubscriptions(conn: Parameters<typeof azureCredential>[0]): Promise<Choice[]> {
  const { list } = makeArmClient(azureCredential(conn));
  const subs = await list<{ subscriptionId: string; displayName?: string; state?: string }>('/subscriptions?api-version=2022-12-01');
  return subs.filter(s => s.state !== 'Disabled').map(s => ({ id: s.subscriptionId, label: s.displayName ? `${s.displayName} (${s.subscriptionId})` : s.subscriptionId }));
}

/** Accounts visible to the identity that just signed in through the CLI. */
export async function signedInChoices(provider: Provider): Promise<Choice[]> {
  try {
    if (provider === 'aws') return [await awsIdentity({ method: 'signin', label: '', regions: ['us-east-1'], profile: AWS_SIGNIN_PROFILE })];
    if (provider === 'gcp') return await gcpProjects();
    if (provider === 'github') return await githubOrgs(await githubCliToken());
    if (provider === 'm365') return await m365Tenants({ method: 'signin' });
    if (provider === 'gworkspace') throw new Error('Google Workspace connects with a service account key.');
    return await azureSubscriptions({ method: 'signin' });
  } catch (err) {
    throw new Error(`Signed in, but the account list could not be read: ${describeError(err)}`);
  }
}

export async function validateAwsKeys(keys: { accessKeyId: string; secretAccessKey: string }): Promise<Choice> {
  try {
    return await awsIdentity({ method: 'keys', label: '', regions: ['us-east-1'], keys });
  } catch (err) {
    throw new Error(`AWS rejected these keys: ${describeError(err)}`);
  }
}

export async function validateGcpKey(keyFile: Record<string, unknown>): Promise<Choice> {
  if (keyFile.type !== 'service_account' || typeof keyFile.client_email !== 'string' || typeof keyFile.private_key !== 'string') {
    throw new Error('That file is not a Google Cloud service account key (JSON).');
  }
  const projectId = String(keyFile.project_id ?? '');
  try {
    const auth = gcpAuth({ keyFile });
    const res = await auth.request<{ projectId: string; name?: string }>({ url: `https://cloudresourcemanager.googleapis.com/v1/projects/${encodeURIComponent(projectId)}` });
    return { id: res.data.projectId, label: res.data.name ? `${res.data.name} (${res.data.projectId})` : res.data.projectId };
  } catch (err) {
    throw new Error(`Google Cloud rejected this key for project ${projectId}: ${describeError(err)}`);
  }
}

export async function validateAzureServicePrincipal(sp: { tenantId: string; clientId: string; clientSecret: string }, subscriptionId: string): Promise<Choice> {
  try {
    const { get } = makeArmClient(azureCredential({ method: 'keys', servicePrincipal: sp }));
    const sub = await get(`https://management.azure.com/subscriptions/${encodeURIComponent(subscriptionId)}?api-version=2022-12-01`) as { displayName?: string };
    return { id: subscriptionId, label: sub.displayName ? `${sub.displayName} (${subscriptionId})` : subscriptionId };
  } catch (err) {
    throw new Error(`Azure rejected this service principal or subscription: ${describeError(err)}`);
  }
}

export async function validateGithubToken(token: string, org: string): Promise<Choice> {
  try {
    const info = await githubClient(token).get<{ login: string; name?: string | null }>(`/orgs/${encodeURIComponent(org)}`);
    return { id: info.login, label: info.name ? `${info.name} (${info.login})` : info.login };
  } catch (err) {
    throw new Error(`GitHub rejected this token for organization "${org}": ${describeError(err)}`);
  }
}

export async function validateGworkspace(keyFile: Record<string, unknown>, adminEmail: string): Promise<Choice> {
  if (keyFile.type !== 'service_account' || typeof keyFile.client_email !== 'string' || typeof keyFile.private_key !== 'string') {
    throw new Error('That file is not a Google Cloud service account key (JSON).');
  }
  try {
    const users = await listGworkspaceUsers(gworkspaceClient(keyFile, adminEmail), 1);
    const domain = adminEmail.split('@')[1];
    return { id: domain, label: `${domain}${users.length ? '' : ' (no users found)'}` };
  } catch (err) {
    const msg = describeError(err);
    const hint = /unauthorized_client/i.test(msg)
      ? ' Domain-wide delegation is not set up for this service account and scope yet (it can take a few minutes to apply).'
      : /not authorized|forbidden|403/i.test(msg) ? ` Check that ${adminEmail} is a Google Workspace admin.` : '';
    throw new Error(`Google Workspace rejected this key: ${msg}.${hint}`);
  }
}

export async function validateM365App(app: { tenantId: string; clientId: string; clientSecret: string }): Promise<Choice> {
  try {
    const [tenant] = await m365Tenants({ method: 'keys', app });
    if (!tenant) throw new Error('No organization found.');
    return tenant;
  } catch (err) {
    throw new Error(`Microsoft 365 rejected this app registration: ${describeError(err)}. Check that admin consent was granted for its API permissions.`);
  }
}
