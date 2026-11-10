import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson } from '@/lib/http';
import { VENDOR_CATALOG } from '@/vendors/catalog';
import { vendorData, type VendorInput } from '@/vendors/service';

/** Adds a vendor. { catalog: "Stripe" } fills in the catalog defaults; { names: [...] } adds several from the catalog. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  const fromCatalog = (name: string) => {
    const c = VENDOR_CATALOG.find(x => x.name === name);
    if (!c) throw new HttpError(400, `"${name}" is not in the catalog.`);
    return vendorData({ name: c.name, website: c.website, category: c.category, dataAccess: c.dataAccess, usesAi: !!c.usesAi, subprocessor: !!c.subprocessor, businessCritical: !!c.critical, owner: user.email });
  };
  const exists = async (name: string) => !!(await prisma.vendor.findFirst({ where: { name: { equals: name, mode: 'insensitive' } }, select: { id: true } }));

  if (Array.isArray(body.names)) {
    let added = 0;
    for (const n of body.names.map(String).slice(0, 100)) {
      if (await exists(n)) continue;
      await prisma.vendor.create({ data: fromCatalog(n) as never });
      added++;
    }
    await logEvent({ action: 'Vendors added', actor: user.email, decision: 'Completed', resource: `${added} vendors` });
    return NextResponse.json({ added });
  }
  const data = typeof body.catalog === 'string' ? fromCatalog(body.catalog) : vendorData({ owner: user.email, ...(body as Partial<VendorInput>), contractEnd: undefined });
  if (await exists(String(data.name))) throw new HttpError(409, 'That vendor is already in the list.');
  const v = await prisma.vendor.create({ data: data as never });
  await logEvent({ action: 'Vendor added', actor: user.email, decision: 'Completed', resource: v.name, reason: `Tier: ${v.tier}` });
  return NextResponse.json({ id: v.id });
});
