import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { isProvider } from '@/checks';
import { validateAd } from '@/connectors/ad';
import { AWS_REGION_RE } from '@/connectors/cli';
import { describeError } from '@/connectors/common';
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
  if (method === 'signin' && (provider === 'gworkspace' || provider === 'ad' || provider === 'devices')) throw new HttpError(400, 'This integration does not use browser sign-in.');
  if (provider === 'devices') throw new HttpError(400, 'Devices report with the agent script; see Devices.');
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
    } else if (provider === 'ad') {
      const url = str(body.url, 'domain controller address', { max: 300 });
      if (!/^ldaps?:\/\/[^\s/]+(:\d+)?\/?$/i.test(url)) throw new HttpError(400, 'The address looks like ldaps://dc01.corp.example.com or ldap://10.0.0.5.');
      const caCert = str(body.caCert, 'CA certificate', { max: 20_000, required: false });
      if (caCert && !caCert.includes('-----BEGIN CERTIFICATE-----')) throw new HttpError(400, 'The CA certificate must be in PEM format (-----BEGIN CERTIFICATE-----).');
      const conn = {
        method: 'keys' as const, label: '', url: url.replace(/\/$/, ''), startTls: body.startTls !== false,
        baseDn: str(body.baseDn, 'base DN', { max: 500, required: false }) || undefined,
        username: str(body.username, 'username', { max: 300 }), password: str(body.password, 'password', { max: 500 }),
        caCert: caCert || undefined,
      };
      if (conn.url.toLowerCase().startsWith('ldap://') && !conn.startTls && body.allowPlaintext !== true) {
        throw new HttpError(400, 'Without ldaps:// or StartTLS the password would be sent unencrypted. Turn on StartTLS or use ldaps://.');
      }
      let choice;
      try {
        choice = await validateAd(conn);
      } catch (err) {
        const msg = describeError(err);
        const hint = /InvalidCredentials|49/i.test(msg) ? ' Check the username and password.'
          : /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|timeout/i.test(msg) ? ' ControlLayer could not reach that domain controller from where it runs.'
          : /certificate|self.signed|UNABLE_TO_VERIFY/i.test(msg) ? ' The domain controller\'s certificate is not trusted: paste your internal CA certificate.' : '';
        throw new HttpError(400, `Active Directory: ${msg}.${hint}`);
      }
      label = choice.label;
      settings = { url: conn.url, startTls: conn.startTls, baseDn: choice.id, username: conn.username, caCert: conn.caCert, label };
      secret = { password: conn.password };
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
