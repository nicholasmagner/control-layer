import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson, type RouteParams } from '@/lib/http';
import { riskData } from '@/risks/service';

export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const existing = await prisma.risk.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Risk not found.');
  const data = riskData(await readJson(req));
  // Changing an accepted risk's treatment or status ends the acceptance.
  if (existing.status === 'accepted' && (data.status || (data.treatment && data.treatment !== 'accept'))) {
    Object.assign(data, { acceptedBy: null, acceptedReason: null, acceptedUntil: null, status: data.status ?? 'open' });
  }
  await prisma.risk.update({ where: { id }, data: data as never });
  if (data.status && data.status !== existing.status) {
    await logEvent({ action: data.status === 'closed' ? 'Risk closed' : 'Risk status changed', actor: user.email, decision: 'Completed', resource: existing.title, reason: String(data.status) });
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const r = await prisma.risk.delete({ where: { id } }).catch(() => { throw new HttpError(404, 'Risk not found.'); });
  await logEvent({ action: 'Risk deleted', actor: user.email, decision: 'Completed', resource: r.title });
  return NextResponse.json({ ok: true });
});
