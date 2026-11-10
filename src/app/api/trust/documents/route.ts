import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { sha256Hex } from '@/evidence/hash';
import { logEvent } from '@/lib/events';

const MAX_BYTES = 25 * 1024 * 1024;

/** Adds a Trust Center document. multipart/form-data: title, description?, access, file. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'admin');
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, 'Expected a multipart form upload.');
  }
  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const access = form.get('access') === 'public' ? 'public' : 'request';
  const file = form.get('file');
  if (!title || title.length > 150) throw new HttpError(400, 'Give the document a title (up to 150 characters).');
  if (description.length > 1000) throw new HttpError(400, 'Description is too long.');
  if (!(file instanceof File) || file.size === 0) throw new HttpError(400, 'Choose a file.');
  if (file.size > MAX_BYTES) throw new HttpError(413, 'Files can be up to 25 MB.');
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await prisma.trustDocument.create({
    data: {
      title, description: description || null, access, uploadedBy: user.email,
      fileName: file.name.slice(0, 200) || 'document', mimeType: file.type || 'application/octet-stream',
      fileSize: data.byteLength, fileData: Buffer.from(data), sha256: sha256Hex(data),
    },
    select: { id: true },
  });
  await logEvent({ action: 'Trust Center document added', actor: user.email, decision: 'Completed', resource: title, reason: access === 'public' ? 'Public' : 'On request' });
  return NextResponse.json(doc);
});
