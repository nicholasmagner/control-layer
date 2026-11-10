import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { publicOrigin, readJson } from '@/lib/http';
import { createSignLinks } from '@/policies/service';

/**
 * Creates personal sign-off links. Body: { personIds: string[] }.
 * Links are only shown now; making a new link replaces the old one.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  if (!Array.isArray(body.personIds) || !body.personIds.length) throw new HttpError(400, 'Choose who to create links for.');
  const ids = body.personIds.map(String).slice(0, 5000);
  const active = await prisma.person.findMany({
    where: { id: { in: ids }, OR: [{ endDate: null }, { endDate: { gt: new Date() } }] },
    select: { id: true },
  });
  if (!active.length) throw new HttpError(400, 'No current people selected.');
  const links = await createSignLinks(active.map(p => p.id), publicOrigin(req));
  await logEvent({ action: 'Sign-off links created', actor: user.email, decision: 'Completed', resource: `${links.length} ${links.length === 1 ? 'person' : 'people'}` });
  return NextResponse.json({ links });
});
