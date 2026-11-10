import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { readJson, str, type RouteParams } from '@/lib/http';

export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const data: Record<string, unknown> = { updatedBy: user.email };
  if ('question' in body) data.question = str(body.question, 'question', { max: 2000 });
  if ('answer' in body) data.answer = str(body.answer, 'answer', { max: 8000 });
  if ('isPublic' in body) data.isPublic = body.isPublic === true;
  await prisma.answerLibraryEntry.update({ where: { id }, data }).catch(() => { throw new HttpError(404, 'Answer not found.'); });
  return NextResponse.json({ ok: true });
});

/** Deletes your answer (for a built-in answer: goes back to the generated text). */
export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  await requireUser(req, 'edit');
  const { id } = await params;
  await prisma.answerLibraryEntry.delete({ where: { id } }).catch(() => { throw new HttpError(404, 'Answer not found.'); });
  return NextResponse.json({ ok: true });
});
