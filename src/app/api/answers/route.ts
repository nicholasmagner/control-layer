import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { readJson, str } from '@/lib/http';
import { ANSWER_BANK } from '@/questionnaires/bank';
import { libraryView } from '@/questionnaires/service';

/** The answer library: built-in answers (generated from live data) and your own. */
export const GET = handle(async (req: Request) => {
  await requireUser(req, 'view');
  return NextResponse.json(await libraryView());
});

/** Adds your own answer, or { builtinKey } to override a built-in answer's text. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  const answer = str(body.answer, 'answer', { max: 8000 });
  const isPublic = body.isPublic === true;
  if (typeof body.builtinKey === 'string') {
    const entry = ANSWER_BANK.find(e => e.key === body.builtinKey);
    if (!entry) throw new HttpError(400, 'Unknown built-in answer.');
    const row = await prisma.answerLibraryEntry.upsert({
      where: { builtinKey: entry.key },
      create: { builtinKey: entry.key, question: entry.questions[0], answer, isPublic, updatedBy: user.email },
      update: { answer, isPublic, updatedBy: user.email },
    });
    return NextResponse.json({ id: row.id });
  }
  const row = await prisma.answerLibraryEntry.create({ data: { question: str(body.question, 'question', { max: 2000 }), answer, isPublic, updatedBy: user.email } });
  return NextResponse.json({ id: row.id });
});
