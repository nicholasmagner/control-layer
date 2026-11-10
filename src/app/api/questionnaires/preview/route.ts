import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { extractQuestions, guessColumns, parseFile } from '@/questionnaires/sheet';

const MAX_QUESTIONNAIRE_BYTES = 15 * 1024 * 1024;

/** Reads an uploaded questionnaire and guesses which column holds the questions. */
export const POST = handle(async (req: Request) => {
  await requireUser(req, 'edit');
  const form = await req.formData().catch(() => { throw new HttpError(400, 'Expected a file upload.'); });
  const file = form.get('file');
  if (!(file instanceof File) || !file.size) throw new HttpError(400, 'Choose a file.');
  if (file.size > MAX_QUESTIONNAIRE_BYTES) throw new HttpError(413, 'Files can be up to 15 MB.');
  let parsed;
  try {
    parsed = await parseFile(file.name, new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    throw new HttpError(400, err instanceof Error ? err.message : 'Could not read that file.');
  }
  return NextResponse.json({
    kind: parsed.kind,
    sheets: parsed.sheets.map(s => {
      const guess = guessColumns(s.rows);
      const header = guess.headerRow >= 0 ? s.rows[guess.headerRow] : [];
      const width = Math.max(0, ...s.rows.slice(0, 200).map(r => r.length));
      return {
        name: s.name,
        guess,
        columns: Array.from({ length: width }, (_, i) => ({
          index: i,
          header: header[i] || `Column ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`,
          sample: s.rows.slice(guess.headerRow + 1).map(r => r[i]).find(Boolean)?.slice(0, 120) ?? '',
        })),
        questionCount: extractQuestions(s.rows, guess).length,
      };
    }).sort((a, b) => b.questionCount - a.questionCount),
  });
});
