import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { Assistant } from '@/assistant/engine';
import { latestCheckOutcomes } from '@/assessment/engine';
import { checksForControl } from '@/checks';
import { prisma } from '@/db/prisma';
import { getControlDef, type FrameworkId } from '@/frameworks';
import { readJson } from '@/lib/http';

export const POST = handle(async (req: Request) => {
  await requireUser(req, 'view');
  const { id } = await readJson<{ id?: unknown }>(req);
  if (typeof id !== 'string' || id.length > 64) throw new HttpError(400, 'Expected { id: string }.');

  const control = await prisma.control.findUnique({
    where: { id },
    include: {
      scores: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
      evidence: { take: 20, orderBy: { evidence: { collectedAt: 'desc' } }, include: { evidence: { select: { title: true, kind: true, collectedAt: true, description: true } } } },
    },
  });
  if (!control) throw new HttpError(404, 'Control not found.');

  const def = getControlDef(control.framework, control.controlId);
  const outcomes = await latestCheckOutcomes();
  const checks = checksForControl(control.framework as FrameworkId, control.controlId).map(c => ({
    check: c.title, description: c.description, latest: outcomes.get(c.id) ?? 'not run yet',
  }));

  const explanation = await Assistant.generateExplanation(
    {
      framework: control.framework, id: control.controlId, title: control.name, description: control.description,
      status: control.applicable ? control.scores[0]?.status : 'Not Applicable', reason: control.scores[0]?.justification,
      evidenceAuditorsExpect: def?.evidence ?? [],
    },
    checks,
    control.evidence.map(e => e.evidence),
  );
  return NextResponse.json({ explanation });
});
