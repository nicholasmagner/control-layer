import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson } from '@/lib/http';
import { addFromLibrary, riskData } from '@/risks/service';

/** Adds risks: { library: [keys] } from the library, or a custom risk. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  if (Array.isArray(body.library)) return NextResponse.json({ added: await addFromLibrary(body.library.map(String).slice(0, 100), user.email) });
  const data = riskData({ owner: user.email, ...body, title: body.title ?? '' });
  const r = await prisma.risk.create({ data: { ...data, createdBy: user.email } as never });
  await logEvent({ action: 'Risk added', actor: user.email, decision: 'Completed', resource: r.title });
  return NextResponse.json({ id: r.id });
});
