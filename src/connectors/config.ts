import type { Provider } from '@/checks/types';
import { prisma } from '@/db/prisma';
import { decryptSecret, encryptSecret } from '@/lib/secrets';

/**
 * How ControlLayer reaches each cloud account, in order of preference:
 *  1. a connection made in the app (Integrations > Connect), stored in the
 *     database: browser sign-in through the cloud's CLI, or read-only keys
 *  2. environment variables (server installs, backwards compatible)
 */

export type Method = 'signin' | 'keys' | 'env';

/** Named AWS CLI profile that browser sign-in (aws login) writes to. */
export const AWS_SIGNIN_PROFILE = 'controllayer';

export interface AwsConnection {
  method: Method;
  label: string;
  regions: string[];
  profile?: string;
  keys?: { accessKeyId: string; secretAccessKey: string };
}

export interface GcpConnection {
  method: Method;
  label: string;
  projectId: string;
  /** Service account key file contents, when method = 'keys'. */
  keyFile?: Record<string, unknown>;
}

export interface AzureConnection {
  method: Method;
  label: string;
  subscriptionId: string;
  servicePrincipal?: { tenantId: string; clientId: string; clientSecret: string };
}

export interface GithubConnection {
  method: Method;
  label: string;
  org: string;
  /** Personal access token, when method = 'keys'. Sign-in uses the gh CLI's token. */
  token?: string;
}

export interface GworkspaceConnection {
  method: Method;
  label: string;
  /** Admin user the service account acts as (domain-wide delegation). */
  adminEmail: string;
  keyFile: Record<string, unknown>;
}

export interface M365Connection {
  method: Method;
  label: string;
  tenantId?: string;
  app?: { tenantId: string; clientId: string; clientSecret: string };
}

export type Connection = AwsConnection | GcpConnection | AzureConnection | GithubConnection | GworkspaceConnection | M365Connection;

const list = (v: string | undefined, fallback: string) =>
  [...new Set((v || fallback).split(',').map(s => s.trim()).filter(Boolean))];

function envAws(): AwsConnection | null {
  const e = process.env;
  const configured = !!(e.AWS_ACCESS_KEY_ID || e.AWS_PROFILE || e.AWS_ROLE_ARN || e.AWS_WEB_IDENTITY_TOKEN_FILE ||
    e.AWS_CONTAINER_CREDENTIALS_FULL_URI || e.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || e.CONTROLLAYER_AWS_ENABLED === 'true');
  if (!configured) return null;
  return { method: 'env', label: 'Server environment', regions: list(e.AWS_REGIONS || e.AWS_REGION, 'us-east-1') };
}

function envGcp(): GcpConnection | null {
  const projectId = process.env.GCP_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;
  return projectId ? { method: 'env', label: projectId, projectId } : null;
}

function envAzure(): AzureConnection | null {
  const subscriptionId = process.env.AZURE_SUBSCRIPTION_ID;
  return subscriptionId ? { method: 'env', label: subscriptionId, subscriptionId } : null;
}

async function stored(provider: Provider) {
  return prisma.connectorConfig.findUnique({ where: { provider } });
}

export async function awsConnection(): Promise<AwsConnection | null> {
  const row = await stored('aws');
  if (!row) return envAws();
  const s = row.settings as { regions?: string[]; label?: string };
  return {
    method: row.method as Method,
    label: s.label ?? 'AWS account',
    regions: s.regions?.length ? s.regions : ['us-east-1'],
    profile: row.method === 'signin' ? AWS_SIGNIN_PROFILE : undefined,
    keys: row.method === 'keys' && row.secret ? decryptSecret(row.secret) : undefined,
  };
}

export async function gcpConnection(): Promise<GcpConnection | null> {
  const row = await stored('gcp');
  if (!row) return envGcp();
  const s = row.settings as { projectId: string; label?: string };
  return {
    method: row.method as Method,
    label: s.label ?? s.projectId,
    projectId: s.projectId,
    keyFile: row.method === 'keys' && row.secret ? decryptSecret(row.secret) : undefined,
  };
}

export async function azureConnection(): Promise<AzureConnection | null> {
  const row = await stored('azure');
  if (!row) return envAzure();
  const s = row.settings as { subscriptionId: string; label?: string };
  return {
    method: row.method as Method,
    label: s.label ?? s.subscriptionId,
    subscriptionId: s.subscriptionId,
    servicePrincipal: row.method === 'keys' && row.secret ? decryptSecret(row.secret) : undefined,
  };
}

export async function githubConnection(): Promise<GithubConnection | null> {
  const row = await stored('github');
  if (!row) {
    const org = process.env.GITHUB_ORG;
    return org && process.env.GITHUB_TOKEN ? { method: 'env', label: org, org, token: process.env.GITHUB_TOKEN } : null;
  }
  const s = row.settings as { org: string; label?: string };
  return {
    method: row.method as Method,
    label: s.label ?? s.org,
    org: s.org,
    token: row.method === 'keys' && row.secret ? (decryptSecret(row.secret) as { token: string }).token : undefined,
  };
}

export async function gworkspaceConnection(): Promise<GworkspaceConnection | null> {
  const row = await stored('gworkspace');
  if (!row?.secret) return null;
  const s = row.settings as { adminEmail: string; label?: string };
  return { method: row.method as Method, label: s.label ?? s.adminEmail, adminEmail: s.adminEmail, keyFile: decryptSecret(row.secret) };
}

export async function m365Connection(): Promise<M365Connection | null> {
  const row = await stored('m365');
  if (!row) return null;
  const s = row.settings as { tenantId?: string; label?: string };
  return {
    method: row.method as Method,
    label: s.label ?? s.tenantId ?? 'Microsoft 365',
    tenantId: s.tenantId,
    app: row.method === 'keys' && row.secret ? decryptSecret(row.secret) : undefined,
  };
}

export function connection(provider: Provider): Promise<Connection | null> {
  switch (provider) {
    case 'aws': return awsConnection();
    case 'gcp': return gcpConnection();
    case 'azure': return azureConnection();
    case 'github': return githubConnection();
    case 'gworkspace': return gworkspaceConnection();
    case 'm365': return m365Connection();
  }
}

export async function saveConnection(provider: Provider, input: {
  method: 'signin' | 'keys';
  settings: Record<string, unknown>;
  secret?: unknown;
  connectedBy: string;
}) {
  const data = {
    method: input.method,
    settings: input.settings as object,
    secret: input.secret !== undefined ? encryptSecret(input.secret) : null,
    connectedBy: input.connectedBy,
  };
  await prisma.connectorConfig.upsert({ where: { provider }, create: { provider, ...data }, update: data });
}

export async function removeConnection(provider: Provider) {
  await prisma.connectorConfig.deleteMany({ where: { provider } });
}

/** True when the app runs on the user's own computer (the desktop app). */
export function isLocalInstall(): boolean {
  return process.env.CONTROLLAYER_DESKTOP === '1';
}
