import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { safeName } from '@/evidence/package';
import { logEvent } from '@/lib/events';
import type { RouteParams } from '@/lib/http';
import { fillWorkbook, newWorkbook } from '@/questionnaires/sheet';

/**
 * Downloads the answered questionnaire: the customer's original Excel file
 * with answers filled in, or a new workbook. ?approvedOnly=1 leaves
 * unapproved answers blank.
 */
export const GET = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'view');
  const { id } = await params;
  const q = await prisma.questionnaire.findUnique({ where: { id }, include: { items: { orderBy: { position: 'asc' } } } });
  if (!q) throw new HttpError(404, 'Questionnaire not found.');
  const approvedOnly = new URL(req.url).searchParams.get('approvedOnly') === '1';
  const answerOf = (it: (typeof q.items)[number]) => (approvedOnly && it.status !== 'approved' ? '' : it.answer);
  let bytes: Uint8Array;
  let name: string;
  if (q.fileData && q.sheetName) {
    bytes = await fillWorkbook(new Uint8Array(q.fileData), q.sheetName, q.headerRow, q.answerCol,
      q.items.filter(it => it.row).map(it => ({ row: it.row!, answer: answerOf(it) })));
    name = q.fileName!.replace(/\.xlsx$/i, '') + ' (answered).xlsx';
  } else {
    bytes = await newWorkbook(q.name, q.items.map(it => ({ section: it.section, question: it.question, answer: answerOf(it), status: it.status })));
    name = `${q.name} (answered).xlsx`;
  }
  await logEvent({ action: 'Questionnaire exported', actor: user.email, decision: 'Completed', resource: q.name });
  const file = safeName(name, 150);
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${file.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(file)}`,
      'Cache-Control': 'private, no-store',
    },
  });
});
