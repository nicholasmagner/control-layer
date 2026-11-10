import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { optionalDate, readJson, type RouteParams } from '@/lib/http';
import { vendorData, type VendorInput } from '@/vendors/service';

export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const existing = await prisma.vendor.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Vendor not found.');
  const body = await readJson(req);
  const input = { ...(body as Partial<VendorInput>) };
  if ('contractEnd' in body) input.contractEnd = optionalDate(body.contractEnd, 'contract end');
  const data = vendorData(input, { dataAccess: existing.dataAccess as string[], businessCritical: existing.businessCritical, usesAi: existing.usesAi, tierOverride: existing.tierOverride });
  await prisma.vendor.update({ where: { id }, data: data as never });
  if ('status' in data && data.status !== existing.status) {
    await logEvent({ action: data.status === 'offboarded' ? 'Vendor offboarded' : 'Vendor reactivated', actor: user.email, decision: 'Completed', resource: existing.name });
  }
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const v = await prisma.vendor.delete({ where: { id } }).catch(() => { throw new HttpError(404, 'Vendor not found.'); });
  await logEvent({ action: 'Vendor removed', actor: user.email, decision: 'Completed', resource: v.name });
  return NextResponse.json({ ok: true });
});
