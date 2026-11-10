import { NextResponse } from 'next/server';
import { assertSameOrigin, handle, HttpError, tooManyAttempts } from '@/auth/session';
import { clientIp, readJson, str, type RouteParams } from '@/lib/http';
import { acceptPolicies } from '@/policies/service';

/** Public: a person accepts policies from their personal link. No sign-in. */
export const POST = handle(async (req: Request, { params }: RouteParams<'token'>) => {
  assertSameOrigin(req);
  const { token } = await params;
  const ip = clientIp(req);
  if (tooManyAttempts(`sign:${ip ?? 'unknown'}`, 30)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  const body = await readJson(req);
  const signedName = str(body.signedName, 'name', { max: 100 });
  if (!Array.isArray(body.versionIds)) throw new HttpError(400, 'Choose at least one policy to accept.');
  const accepted = await acceptPolicies(token, body.versionIds.map(String).slice(0, 200), signedName, ip);
  return NextResponse.json({ accepted });
});
