import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { scheduleDeviceScan } from '@/devices/service';
import { logEvent } from '@/lib/events';
import { EMAIL_RE, readJson, type RouteParams } from '@/lib/http';

/** Changes a device's role (server / workstation) or owner. */
export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const data: Record<string, unknown> = {};
  if ('role' in body) {
    if (body.role !== 'server' && body.role !== 'workstation') throw new HttpError(400, 'Role must be server or workstation.');
    data.role = body.role;
  }
  if ('owner' in body) {
    const owner = typeof body.owner === 'string' ? body.owner.trim().toLowerCase() : '';
    if (owner && !EMAIL_RE.test(owner)) throw new HttpError(400, 'Owner must be an email address.');
    data.owner = owner || null;
  }
  await prisma.device.update({ where: { id }, data }).catch(() => { throw new HttpError(404, 'Device not found.'); });
  scheduleDeviceScan();
  return NextResponse.json({ ok: true });
});

/** Removes a retired device. It comes back if its agent reports again. */
export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const device = await prisma.device.findUnique({ where: { id }, select: { hostname: true } });
  if (!device) throw new HttpError(404, 'Device not found.');
  await prisma.device.delete({ where: { id } });
  await logEvent({ action: 'Device removed', actor: user.email, decision: 'Completed', resource: device.hostname });
  scheduleDeviceScan();
  return NextResponse.json({ ok: true });
});
