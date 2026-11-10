import { NextResponse } from 'next/server';
import { getReview } from '@/access/service';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import type { RouteParams } from '@/lib/http';

export const GET = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  await requireUser(req, 'view');
  const { id } = await params;
  return NextResponse.json(await getReview(id));
});

/** Deletes a review that is still in progress (completed reviews are kept as evidence). */
export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const r = await prisma.accessReview.findUnique({ where: { id }, select: { status: true, name: true } });
  if (!r) throw new HttpError(404, 'Access review not found.');
  if (r.status === 'completed') throw new HttpError(409, 'Completed reviews are kept as audit records.');
  await prisma.accessReview.delete({ where: { id } });
  await logEvent({ action: 'Access review deleted', actor: user.email, decision: 'Completed', resource: r.name });
  return NextResponse.json({ ok: true });
});
