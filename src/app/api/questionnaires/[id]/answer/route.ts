import { NextResponse } from 'next/server';
import { assistantConfigured } from '@/assistant/engine';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { readJson, type RouteParams } from '@/lib/http';
import { autoAnswer, draftWithAssistant } from '@/questionnaires/service';

/**
 * { action: 'refresh' }    re-answer everything not yet approved, from current data
 * { action: 'assistant' }  draft answers for unmatched questions (if the assistant is set up)
 * { action: 'approve', minConfidence } approve suggestions at or above a confidence
 */
export const POST = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  if (!(await prisma.questionnaire.findUnique({ where: { id }, select: { id: true } }))) throw new HttpError(404, 'Questionnaire not found.');
  const body = await readJson(req);
  if (body.action === 'refresh') return NextResponse.json(await autoAnswer(id));
  if (body.action === 'assistant') {
    if (!(await assistantConfigured())) throw new HttpError(400, 'The assistant is not set up. An admin can add an API key in Settings.');
    return NextResponse.json({ drafted: await draftWithAssistant(id) });
  }
  if (body.action === 'approve') {
    const min = Math.min(1, Math.max(0, Number(body.minConfidence ?? 0.7)));
    const res = await prisma.questionnaireItem.updateMany({
      where: { questionnaireId: id, status: 'suggested', confidence: { gte: min } },
      data: { status: 'approved', approvedBy: user.email },
    });
    return NextResponse.json({ approved: res.count });
  }
  throw new HttpError(400, 'Unknown action.');
});
