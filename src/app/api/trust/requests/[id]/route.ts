import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { publicOrigin, readJson, type RouteParams } from '@/lib/http';
import { loadTrustConfig } from '@/trust/config';
import { hashAccessToken, newAccessToken } from '@/trust/public';

/**
 * Decides on an access request. { action: 'approve' } returns a personal
 * access link (shown once); 'deny' and 'revoke' end access.
 */
export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const body = await readJson(req);
  const request = await prisma.trustRequest.findUnique({ where: { id } });
  if (!request) throw new HttpError(404, 'Request not found.');

  if (body.action === 'approve') {
    const token = newAccessToken();
    const days = (await loadTrustConfig()).accessDays;
    const expiresAt = new Date(Date.now() + days * 86_400_000);
    await prisma.trustRequest.update({
      where: { id },
      data: { status: 'approved', decidedBy: user.email, decidedAt: new Date(), tokenHash: hashAccessToken(token), expiresAt },
    });
    await logEvent({ action: 'Trust Center access approved', actor: user.email, decision: 'Completed', resource: `${request.email} (${request.company})`, reason: `Valid ${days} days` });
    return NextResponse.json({ url: `${publicOrigin(req)}/trust/access/${token}`, expiresAt: expiresAt.toISOString() });
  }
  if (body.action === 'deny' || body.action === 'revoke') {
    await prisma.trustRequest.update({
      where: { id },
      data: { status: 'denied', decidedBy: user.email, decidedAt: new Date(), tokenHash: null, expiresAt: null },
    });
    await logEvent({ action: body.action === 'deny' ? 'Trust Center access denied' : 'Trust Center access revoked', actor: user.email, decision: 'Completed', resource: `${request.email} (${request.company})` });
    return NextResponse.json({ ok: true });
  }
  throw new HttpError(400, 'Unknown action.');
});
