import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { getControlDef } from '@/frameworks';
import { logEvent } from '@/lib/events';
import { readJson, str, type RouteParams } from '@/lib/http';

/** Edits a policy draft and its settings. Publishing is a separate step. */
export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const policy = await prisma.policy.findUnique({ where: { id } });
  if (!policy) throw new HttpError(404, 'Policy not found.');

  const data: Record<string, unknown> = {};
  if ('title' in body) data.title = str(body.title, 'title', { max: 150 });
  if ('summary' in body) data.summary = str(body.summary, 'summary', { max: 500, required: false });
  if ('draft' in body) data.draft = str(body.draft, 'policy text', { max: 200_000 });
  if ('owner' in body) data.owner = str(body.owner, 'owner', { max: 150, required: false }) || null;
  if ('requiresSignoff' in body) data.requiresSignoff = body.requiresSignoff === true;
  if ('reviewIntervalDays' in body) {
    const days = Number(body.reviewIntervalDays);
    if (!Number.isInteger(days) || days < 30 || days > 1095) throw new HttpError(400, 'Review interval must be 30 to 1095 days.');
    data.reviewIntervalDays = days;
  }
  if ('controls' in body) {
    if (!Array.isArray(body.controls) || body.controls.length > 100) throw new HttpError(400, 'Invalid controls.');
    const keys = [...new Set(body.controls.map(String))];
    for (const k of keys) {
      const [fw, cid] = k.split(':');
      if (!getControlDef(fw, cid)) throw new HttpError(400, `Unknown control "${k}".`);
    }
    data.controls = keys;
  }
  await prisma.policy.update({ where: { id }, data });
  if ('title' in body || 'requiresSignoff' in body || 'controls' in body) {
    await logEvent({ action: 'Policy settings changed', actor: user.email, decision: 'Completed', resource: policy.title });
  }
  return NextResponse.json({ ok: true });
});

/** Removes a policy. Published versions stay in the evidence library. */
export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const policy = await prisma.policy.findUnique({ where: { id } });
  if (!policy) throw new HttpError(404, 'Policy not found.');
  await prisma.policy.delete({ where: { id } });
  await logEvent({ action: 'Policy removed', actor: user.email, decision: 'Completed', resource: policy.title });
  return NextResponse.json({ ok: true });
});
