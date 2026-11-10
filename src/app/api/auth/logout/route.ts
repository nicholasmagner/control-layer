import { NextResponse } from 'next/server';
import { assertSameOrigin, destroySession, handle } from '@/auth/session';

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  await destroySession();
  return NextResponse.json({ ok: true });
});
