import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { readJson, str, type RouteParams } from '@/lib/http';
import { similarity } from '@/questionnaires/match';

/**
 * Edits / approves one answer. With saveToLibrary, the approved answer is
 * remembered and suggested for similar questions in future questionnaires.
 */
export const PATCH = handle(async (req: Request, { params }: RouteParams<'id' | 'itemId'>) => {
  const user = await requireUser(req, 'edit');
  const { id, itemId } = await params;
  const item = await prisma.questionnaireItem.findFirst({ where: { id: itemId, questionnaireId: id } });
  if (!item) throw new HttpError(404, 'Question not found.');
  const body = await readJson(req);
  const answer = 'answer' in body ? str(body.answer, 'answer', { max: 8000, required: false }) : item.answer;
  const status = body.status === 'approved' || body.status === 'needs_input' || body.status === 'suggested' ? body.status : item.status;
  if (status === 'approved' && !answer) throw new HttpError(400, 'Write an answer before approving.');
  await prisma.questionnaireItem.update({
    where: { id: itemId },
    data: { answer, status, approvedBy: status === 'approved' ? user.email : null, confidence: answer !== item.answer ? 1 : item.confidence },
  });

  let savedToLibrary = false;
  const src = item.source as { type?: string; id?: string } | null;
  if (status === 'approved') {
    if (src?.type === 'library' && src.id) {
      await prisma.answerLibraryEntry.updateMany({ where: { id: src.id }, data: { usageCount: { increment: 1 } } });
    }
    const edited = answer !== item.answer || src?.type === 'assistant' || src?.type === 'none' || !src;
    if (body.saveToLibrary === true && edited) {
      const existing = src?.type === 'library' && src.id ? await prisma.answerLibraryEntry.findUnique({ where: { id: src.id } }) : null;
      if (existing && similarity(item.question, [existing.question]) > 0.9) {
        await prisma.answerLibraryEntry.update({ where: { id: existing.id }, data: { answer, updatedBy: user.email } });
      } else {
        await prisma.answerLibraryEntry.create({ data: { question: item.question, answer, updatedBy: user.email, usageCount: 1 } });
      }
      savedToLibrary = true;
    }
  }
  return NextResponse.json({ ok: true, savedToLibrary });
});
