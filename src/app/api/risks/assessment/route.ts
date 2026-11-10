import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { completeAssessment } from '@/risks/service';

/** Completes the periodic risk assessment and saves the register as evidence. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const controls = await prisma.control.findMany({ include: { scores: { orderBy: { evaluatedAt: 'desc' }, take: 1 } } });
  const status = new Map(controls.map(c => [`${c.framework}:${c.controlId}`, !c.applicable ? 'Not Applicable' : c.scores[0]?.status ?? 'Needs Evidence']));
  await completeAssessment(user.email, status);
  return NextResponse.json({ ok: true });
});
