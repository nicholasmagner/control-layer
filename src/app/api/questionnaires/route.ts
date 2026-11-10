import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { autoAnswer } from '@/questionnaires/service';
import { extractQuestions, guessColumns, parseFile, questionsFromText, type ExtractedQuestion } from '@/questionnaires/sheet';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Creates a questionnaire from an uploaded file (Excel / CSV) or pasted
 * questions, and answers it straight away. multipart/form-data:
 *   name, customer?, dueDate?, file? + sheet?, questionCol?, answerCol?, text?
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const form = await req.formData().catch(() => { throw new HttpError(400, 'Expected a form upload.'); });
  const name = String(form.get('name') ?? '').trim().slice(0, 150);
  const customer = String(form.get('customer') ?? '').trim().slice(0, 150);
  const due = String(form.get('dueDate') ?? '');
  if (!name) throw new HttpError(400, 'Give the questionnaire a name.');
  const file = form.get('file');

  let questions: ExtractedQuestion[];
  let stored: { fileName: string; fileData: Buffer; sheetName: string; questionCol: number; answerCol: number | null; headerRow: number } | null = null;
  if (file instanceof File && file.size) {
    if (file.size > MAX_BYTES) throw new HttpError(413, 'Files can be up to 15 MB.');
    const data = new Uint8Array(await file.arrayBuffer());
    let parsed;
    try {
      parsed = await parseFile(file.name, data);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : 'Could not read that file.');
    }
    const sheet = parsed.sheets.find(s => s.name === form.get('sheet')) ?? parsed.sheets[0];
    const guess = guessColumns(sheet.rows);
    const qc = form.get('questionCol');
    const ac = form.get('answerCol');
    if (qc !== null && qc !== '') guess.questionCol = Number(qc);
    if (ac !== null) guess.answerCol = ac === '' || ac === 'new' ? null : Number(ac);
    questions = extractQuestions(sheet.rows, guess);
    if (parsed.kind === 'xlsx') {
      stored = { fileName: file.name.slice(0, 200), fileData: Buffer.from(data), sheetName: sheet.name, questionCol: guess.questionCol, answerCol: guess.answerCol, headerRow: guess.headerRow };
    }
  } else {
    questions = questionsFromText(String(form.get('text') ?? ''));
  }
  if (!questions.length) throw new HttpError(400, 'No questions were found. Check the question column, or paste one question per line.');
  if (questions.length > 2000) throw new HttpError(400, 'Questionnaires can have up to 2,000 questions.');

  const q = await prisma.questionnaire.create({
    data: {
      name, customer: customer || null, createdBy: user.email,
      dueDate: /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T00:00:00Z`) : null,
      ...(stored ? { fileName: stored.fileName, fileData: stored.fileData, sheetName: stored.sheetName, headerRow: stored.headerRow, questionCol: stored.questionCol, answerCol: stored.answerCol } : {}),
      items: { create: questions.map((x, i) => ({ position: i, row: x.row, section: x.section, question: x.question })) },
    },
  });
  const result = await autoAnswer(q.id);
  await logEvent({ action: 'Questionnaire added', actor: user.email, decision: 'Completed', resource: name, reason: `${questions.length} questions, ${result.answered} answered automatically` });
  return NextResponse.json({ id: q.id, ...result });
});
