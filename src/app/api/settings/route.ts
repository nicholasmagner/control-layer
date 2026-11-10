import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { testAssistantKey } from '@/assistant/engine';
import { logEvent } from '@/lib/events';
import { readJson } from '@/lib/http';
import { secretsAvailable } from '@/lib/secrets';
import { getSettings, saveSettings, SCAN_INTERVAL_CHOICES, settingsView, type Settings } from '@/lib/settings';

const LABELS: Partial<Record<keyof Settings, string>> = {
  organizationName: 'organization name', scanIntervalHours: 'automatic scans', snapshotIntervalDays: 'evidence image interval',
  timestampAuthorityUrl: 'independent timestamps', remediationEnabled: 'one-click AWS fix', assistantApiKey: 'assistant API key', assistantModel: 'assistant model',
};

/** Admins change workspace settings; changes apply immediately. */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req, 'admin');
  const body = await readJson(req);
  const out: Partial<Settings> = {};

  if (body.organizationName !== undefined) {
    const v = typeof body.organizationName === 'string' ? body.organizationName.trim() : '';
    if (!v || v.length > 120) throw new HttpError(400, 'Organization name must be 1 to 120 characters.');
    out.organizationName = v;
  }
  if (body.scanIntervalHours !== undefined) {
    const n = Number(body.scanIntervalHours);
    if (!SCAN_INTERVAL_CHOICES.includes(n as (typeof SCAN_INTERVAL_CHOICES)[number])) throw new HttpError(400, 'Choose a scan schedule from the list.');
    out.scanIntervalHours = n === 0 ? null : n;
  }
  if (body.snapshotIntervalDays !== undefined) {
    const n = Number(body.snapshotIntervalDays);
    if (!Number.isInteger(n) || n < 1 || n > 365) throw new HttpError(400, 'Evidence image interval must be 1 to 365 days.');
    out.snapshotIntervalDays = n;
  }
  if (body.timestampsEnabled !== undefined) {
    if (!body.timestampsEnabled) {
      out.timestampAuthorityUrl = null;
    } else {
      const url = typeof body.timestampAuthorityUrl === 'string' ? body.timestampAuthorityUrl.trim() : '';
      try {
        if (new URL(url).protocol !== 'https:') throw new Error();
      } catch {
        throw new HttpError(400, 'The timestamp authority must be an https:// address.');
      }
      out.timestampAuthorityUrl = url;
    }
  }
  if (body.remediationEnabled !== undefined) {
    if (typeof body.remediationEnabled !== 'boolean') throw new HttpError(400, 'remediationEnabled must be true or false.');
    out.remediationEnabled = body.remediationEnabled;
  }
  if (body.assistantApiKey !== undefined) {
    if (body.assistantApiKey === null) {
      out.assistantApiKey = null;
    } else {
      if (!secretsAvailable()) throw new HttpError(400, 'This server cannot store the key safely because CONTROLLAYER_SECRET_KEY is not set.');
      const key = typeof body.assistantApiKey === 'string' ? body.assistantApiKey.trim() : '';
      if (key.length < 20 || key.length > 400 || /\s/.test(key)) throw new HttpError(400, 'That does not look like an API key.');
      let models: string[];
      try {
        models = await testAssistantKey(key);
      } catch (err) {
        const status = (err as { status?: number }).status;
        throw new HttpError(400, status === 401 ? 'That API key is not valid, or it has been revoked.'
          : status === 403 ? 'That API key does not have permission to use the API.'
          : 'The key could not be checked right now. Check the network connection and try again.');
      }
      const model = typeof body.assistantModel === 'string' ? body.assistantModel.trim() : '';
      if (model && !models.includes(model)) throw new HttpError(400, `This key cannot use the model "${model}".`);
      out.assistantApiKey = key;
    }
  }
  if (body.assistantModel !== undefined) {
    const model = typeof body.assistantModel === 'string' ? body.assistantModel.trim() : '';
    if (model.length > 100) throw new HttpError(400, 'Model name is too long.');
    if (model && body.assistantApiKey === undefined) {
      const key = (await getSettings()).assistantApiKey;
      if (key) {
        const models = await testAssistantKey(key).catch(() => null);
        if (models && !models.includes(model)) throw new HttpError(400, `The saved key cannot use the model "${model}".`);
      }
    }
    out.assistantModel = model || null;
  }

  if (Object.keys(out).length === 0) throw new HttpError(400, 'Nothing to change.');
  await saveSettings(out, user.email);
  await logEvent({
    action: 'Settings changed', actor: user.email, decision: 'Completed',
    reason: Object.keys(out).map(k => LABELS[k as keyof Settings] ?? k).join(', '),
  });
  return NextResponse.json({ ok: true, settings: await settingsView() });
});

/** Assistant: list the models the saved key can use (for the model picker). */
export const GET = handle(async (req: Request) => {
  await requireUser(req, 'admin');
  const key = (await getSettings()).assistantApiKey;
  if (!key) return NextResponse.json({ models: [] });
  try {
    return NextResponse.json({ models: await testAssistantKey(key) });
  } catch {
    return NextResponse.json({ models: [] });
  }
});
