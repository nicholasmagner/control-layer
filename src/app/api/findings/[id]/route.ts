import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson, str, type RouteParams } from '@/lib/http';

/**
 * Accept the risk of a finding (with a documented reason) or reopen it.
 * Findings are resolved automatically when a later scan sees them fixed.
 */
export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const finding = await prisma.finding.findUnique({ where: { id } });
  if (!finding) throw new HttpError(404, 'Finding not found.');

  if (body.action === 'accept') {
    const reason = str(body.reason, 'reason', { max: 2000 });
    await prisma.finding.update({ where: { id }, data: { status: 'Accepted', acceptedBy: user.email, acceptReason: reason } });
    await logEvent({ action: 'Risk accepted', actor: user.email, decision: 'Accepted', resource: finding.resource ?? finding.title, reason: `${finding.title}: ${reason}` });
  } else if (body.action === 'reopen') {
    await prisma.finding.update({ where: { id }, data: { status: 'Open', acceptedBy: null, acceptReason: null, resolvedAt: null } });
    await logEvent({ action: 'Finding reopened', actor: user.email, decision: 'Open', resource: finding.resource ?? finding.title, reason: finding.title });
  } else {
    throw new HttpError(400, 'action must be "accept" or "reopen".');
  }
  return NextResponse.json({ ok: true });
});
