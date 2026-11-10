import { NextResponse } from 'next/server';
import { hashPassword, passwordProblem } from '@/auth/password';
import { assertSameOrigin, createSession, handle, HttpError } from '@/auth/session';
import { syncControls } from '@/assessment/engine';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { email, readJson, str } from '@/lib/http';

/** First-run setup: creates the first administrator. Disabled once any user exists. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  if ((await prisma.user.count()) > 0) throw new HttpError(409, 'Setup is already complete. Sign in instead.');

  const body = await readJson(req);
  const name = str(body.name, 'name', { max: 100 });
  const address = email(body.email);
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(400, problem);

  const user = await prisma.user.create({
    data: { name, email: address, role: 'admin', passwordHash: await hashPassword(body.password as string) },
  });
  await syncControls();
  await createSession(user.id);
  await logEvent({ action: 'Workspace created', actor: address, decision: 'Completed' });
  return NextResponse.json({ ok: true });
});
