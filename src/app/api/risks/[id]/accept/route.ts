import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { optionalDate, readJson, str, type RouteParams } from '@/lib/http';
import { acceptRisk } from '@/risks/service';

/** Admins formally accept a risk, with a reason and an expiry date. */
export const POST = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const body = await readJson(req);
  const until = optionalDate(body.until, 'review date') ?? new Date(Date.now() + 365 * 86_400_000);
  await acceptRisk(id, str(body.reason, 'reason', { max: 3000 }), until, user.email);
  return NextResponse.json({ ok: true });
});
