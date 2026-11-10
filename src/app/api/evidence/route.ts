import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { recomputeAssessments } from '@/assessment/engine';
import { prisma } from '@/db/prisma';
import { anchorChain, appendEvidence } from '@/evidence/store';
import { logEvent } from '@/lib/events';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Adds evidence: an uploaded file (policy, screenshot, report, export) and/or
 * a written note, linked to one or more controls. multipart/form-data fields:
 *   title, description?, controlIds (repeatable), file?
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, 'Expected a multipart form upload.');
  }

  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const controlIds = [...new Set(form.getAll('controlIds').map(String).filter(Boolean))];
  const file = form.get('file');

  if (!title || title.length > 200) throw new HttpError(400, 'Give the evidence a title (up to 200 characters).');
  if (description.length > 5000) throw new HttpError(400, 'Description is too long.');
  if (controlIds.length === 0) throw new HttpError(400, 'Link the evidence to at least one control.');
  const found = await prisma.control.count({ where: { id: { in: controlIds } } });
  if (found !== controlIds.length) throw new HttpError(400, 'One or more selected controls no longer exist.');

  let upload: { name: string; mimeType: string; data: Uint8Array } | undefined;
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Files can be up to 25 MB.');
    upload = { name: file.name.slice(0, 200) || 'upload', mimeType: file.type || 'application/octet-stream', data: new Uint8Array(await file.arrayBuffer()) };
  } else if (!description) {
    throw new HttpError(400, 'Attach a file or write a note describing the evidence.');
  }

  const created = await appendEvidence({
    title,
    description: description || undefined,
    kind: upload ? 'upload' : 'note',
    source: upload ? 'upload' : 'note',
    content: upload ? undefined : { note: description },
    file: upload,
    controlIds,
    collectedBy: user.email,
  });
  await recomputeAssessments();
  // Timestamp the new chain head in the background; failures are logged.
  void anchorChain(user.email).catch(err => console.error('[timestamp]', err));
  await logEvent({
    action: 'Evidence added', actor: user.email, decision: 'Completed', resource: title,
    reason: upload ? `${upload.name} (${Math.ceil(upload.data.byteLength / 1024)} KB)` : 'Written note',
  });
  return NextResponse.json({ ok: true, id: created.id });
});
