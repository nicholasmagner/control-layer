import { NextResponse } from 'next/server';
import { completeReview } from '@/access/service';
import { handle, requireUser } from '@/auth/session';
import type { RouteParams } from '@/lib/http';

/** Completes the review and saves it as audit evidence. */
export const POST = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  await completeReview(id, user.email);
  return NextResponse.json({ ok: true });
});
