import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { logEvent } from '@/lib/events';
import { readJson } from '@/lib/http';
import { loadTrustConfig, mergeTrustConfig, saveTrustConfig } from '@/trust/config';

/** Saves Trust Center settings (admins). Only the fields sent are changed. */
export const PUT = handle(async (req: Request) => {
  const user = await requireUser(req, 'admin');
  const current = await loadTrustConfig();
  const next = mergeTrustConfig(current, await readJson(req));
  await saveTrustConfig(next, user.email);
  if (next.enabled !== current.enabled) {
    await logEvent({ action: next.enabled ? 'Trust Center published' : 'Trust Center unpublished', actor: user.email, decision: 'Completed' });
  }
  return NextResponse.json({ ok: true });
});
