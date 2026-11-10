import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { isProvider } from '@/checks';
import { AWS_REGION_RE } from '@/connectors/cli';
import { removeConnection, saveConnection } from '@/connectors/config';
import {
  signedInChoices, validateAwsKeys, validateAzureServicePrincipal, validateGcpKey, validateGithubToken, validateGworkspace, validateM365App,
} from '@/connectors/discover';
import { logEvent } from '@/lib/events';
import { email, readJson, str, type RouteParams } from '@/lib/http';
import { secretsAvailable } from '@/lib/secrets';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function regions(value: unknown): string[] {
  const list = Array.isArray(value) ? value.filter((r): r is string => typeof r === 'string' && AWS_REGION_RE.test(r)) : [];
  if (!list.length) throw new HttpError(400, 'Choose at least one AWS region.');
  return [...new Set(list)].slice(0, 30);
}

/**
 * Saves a cloud connection after checking it works.
 *   method 'signin': uses the CLI session from the browser sign-in; body names the account to scan.
 *   method 'keys':   read-only keys, stored encrypted.
 */
export const PUT = handle(async (req: Request, { params }: RouteParams<'provider'>) => {
  const user = await requireUser(req, 'admin');
  const { provider } = await params;
  if (!isProvider(provider)) throw new HttpError(404, 'Unknown integration.');
  const body = await readJson(req);
  const method = body.method;
  if (method !== 'signin' && method !== 'keys') throw new HttpError(400, 'method must be "signin" or "keys".');
  if (method === 'signin' && provider === 'gworkspace') throw new HttpError(400, 'Google Workspace connects with a service account key.');
  if (method === 'keys' && !secretsAvailable()) {
    throw new HttpError(400, 'This server cannot store keys safely because CONTROLLAYER_SECRET_KEY is not set. Ask your administrator to set it, or use environment variables.');
  }

  let label: string;
  let settings: Record<string, unknown>;
  let secret: unknown;
  try {
    if (method === 'signin') {
      const choices = await signedInChoices(provider);
      const id = str(body.accountId, 'accountId', { max: 200 });
      const choice = choices.find(c => c.id === id);
      if (!choice) throw new HttpError(400, 'That account is not available to the signed-in user. Sign in again.');
      label = choice.label;
      settings = provider === 'aws' ? { regions: regions(body.regions), label }
        : provider === 'gcp' ? { projectId: choice.id, label }
        : provider === 'github' ? { org: choice.id, label }
        : provider === 'm365' ? { tenantId: choice.id, label }
        : { subscriptionId: choice.id, label };
    } else if (provider === 'aws') {
      const keys = { accessKeyId: str(body.accessKeyId, 'accessKeyId', { max: 128 }), secretAccessKey: str(body.secretAccessKey, 'secretAccessKey', { max: 256 }) };
      label = (await validateAwsKeys(keys)).label;
      settings = { regions: regions(body.regions), label };
      secret = keys;
    } else if (provider === 'gcp') {
      if (!body.keyFile || typeof body.keyFile !== 'object') throw new HttpError(400, 'Upload the service account key file.');
      const keyFile = body.keyFile as Record<string, unknown>;
      const choice = await validateGcpKey(keyFile);
      label = choice.label;
      settings = { projectId: choice.id, label };
      secret = keyFile;
    } else if (provider === 'github') {
      const token = str(body.token, 'token', { max: 300 });
      const org = str(body.org, 'organization', { max: 100 }).replace(/^https:\/\/github\.com\//, '').replace(/\/.*$/, '');
      const choice = await validateGithubToken(token, org);
      label = choice.label;
      settings = { org: choice.id, label };
      secret = { token };
    } else if (provider === 'gworkspace') {
      if (!body.keyFile || typeof body.keyFile !== 'object') throw new HttpError(400, 'Upload the service account key file.');
      const keyFile = body.keyFile as Record<string, unknown>;
      const adminEmail = email(body.adminEmail);
      label = (await validateGworkspace(keyFile, adminEmail)).label;
      settings = { adminEmail, label };
      secret = keyFile;
    } else if (provider === 'm365') {
      const app = { tenantId: str(body.tenantId, 'tenantId', { max: 100 }), clientId: str(body.clientId, 'clientId', { max: 100 }), clientSecret: str(body.clientSecret, 'clientSecret', { max: 500 }) };
      if (!GUID.test(app.clientId)) throw new HttpError(400, 'The client ID looks like 00000000-0000-0000-0000-000000000000.');
      const choice = await validateM365App(app);
      label = choice.label;
      settings = { tenantId: app.tenantId, label };
      secret = app;
    } else {
      const sp = { tenantId: str(body.tenantId, 'tenantId', { max: 100 }), clientId: str(body.clientId, 'clientId', { max: 100 }), clientSecret: str(body.clientSecret, 'clientSecret', { max: 500 }) };
      const subscriptionId = str(body.subscriptionId, 'subscriptionId', { max: 100 });
      if (!GUID.test(subscriptionId) || !GUID.test(sp.clientId)) throw new HttpError(400, 'Subscription ID and client ID look like 00000000-0000-0000-0000-000000000000.');
      label = (await validateAzureServicePrincipal(sp, subscriptionId)).label;
      settings = { subscriptionId, label };
      secret = sp;
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, err instanceof Error ? err.message : String(err));
  }

  await saveConnection(provider, { method, settings, secret, connectedBy: user.email });
  await logEvent({ action: 'Integration connected', actor: user.email, decision: 'Completed', resource: label, reason: `${provider}, ${method === 'signin' ? 'browser sign-in' : 'read-only keys'}` });
  return NextResponse.json({ ok: true, label });
});

export const DELETE = handle(async (req: Request, { params }: RouteParams<'provider'>) => {
  const user = await requireUser(req, 'admin');
  const { provider } = await params;
  if (!isProvider(provider)) throw new HttpError(404, 'Unknown integration.');
  await removeConnection(provider);
  await logEvent({ action: 'Integration disconnected', actor: user.email, decision: 'Completed', resource: provider });
  return NextResponse.json({ ok: true });
});
