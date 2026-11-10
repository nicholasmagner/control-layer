import { NextResponse } from 'next/server';
import { verifyPassword } from '@/auth/password';
import { assertSameOrigin, clearAttempts, createSession, handle, HttpError, tooManyAttempts } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson } from '@/lib/http';

export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  const body = await readJson(req);
  const address = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  const key = `${address}|${req.headers.get('x-forwarded-for') ?? 'local'}`;
  if (tooManyAttempts(key)) throw new HttpError(429, 'Too many sign-in attempts. Try again in 15 minutes.');

  const user = address ? await prisma.user.findUnique({ where: { email: address } }) : null;
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new HttpError(401, 'Email or password is incorrect.');
  }
  clearAttempts(key);
  await createSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logEvent({ action: 'Signed in', actor: user.email, decision: 'Completed' });
  return NextResponse.json({ ok: true });
});
