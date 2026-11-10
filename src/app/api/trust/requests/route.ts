import { NextResponse } from 'next/server';
import { assertSameOrigin, handle, HttpError, tooManyAttempts } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { clientIp, email, readJson, str } from '@/lib/http';
import { loadTrustConfig } from '@/trust/config';

/** Public: someone asks for access to the Trust Center documents. */
export const POST = handle(async (req: Request) => {
  assertSameOrigin(req);
  if (!(await loadTrustConfig()).enabled) throw new HttpError(404, 'Not found.');
  const ip = clientIp(req);
  if (tooManyAttempts(`trust:${ip ?? 'unknown'}`, 5, 60 * 60_000)) throw new HttpError(429, 'Too many requests. Try again later.');
  const body = await readJson(req);
  // Hidden field that people never fill in; bots often do.
  if (typeof body.website === 'string' && body.website.trim()) return NextResponse.json({ ok: true });
  if (body.ndaAccepted !== true) throw new HttpError(400, 'Please accept the confidentiality terms.');
  const request = {
    name: str(body.name, 'name', { max: 100 }),
    email: email(body.email),
    company: str(body.company, 'company', { max: 150 }),
    reason: str(body.reason, 'reason', { max: 1000, required: false }) || null,
  };
  if (await prisma.trustRequest.count({ where: { email: request.email, status: 'pending' } }) >= 3) {
    return NextResponse.json({ ok: true });
  }
  await prisma.trustRequest.create({ data: { ...request, ndaAccepted: true, ip } });
  await logEvent({ action: 'Trust Center access requested', actor: request.email, decision: 'Started', resource: request.company });
  return NextResponse.json({ ok: true });
});
