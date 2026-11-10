import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { getDeviceKey, rotateDeviceKey } from '@/devices/service';
import { logEvent } from '@/lib/events';
import { secretsAvailable } from '@/lib/secrets';

/** The device key used in agent install commands (admins). */
export const GET = handle(async (req: Request) => {
  await requireUser(req, 'admin');
  return NextResponse.json({ key: await getDeviceKey() });
});

/** Creates a new device key. Devices using the old key must be set up again. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'admin');
  if (!secretsAvailable()) throw new HttpError(400, 'This server cannot store keys safely because CONTROLLAYER_SECRET_KEY is not set.');
  const hadKey = !!(await getDeviceKey());
  const key = await rotateDeviceKey(user.email);
  await logEvent({ action: hadKey ? 'Device key replaced' : 'Device key created', actor: user.email, decision: 'Completed' });
  return NextResponse.json({ key });
});
