import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import type { RouteParams } from '@/lib/http';

const KINDS = new Set(['soc2', 'iso27001', 'pentest', 'questionnaire', 'contract', 'dpa', 'baa', 'other']);

/** Uploads a vendor document (SOC 2 report, contract, DPA...). multipart: kind, title, validUntil?, file. */
export const POST = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const vendor = await prisma.vendor.findUnique({ where: { id }, select: { name: true } });
  if (!vendor) throw new HttpError(404, 'Vendor not found.');
  const form = await req.formData().catch(() => { throw new HttpError(400, 'Expected a file upload.'); });
  const file = form.get('file');
  const kind = String(form.get('kind') ?? 'other');
  if (!KINDS.has(kind)) throw new HttpError(400, 'Unknown document type.');
  if (!(file instanceof File) || !file.size) throw new HttpError(400, 'Choose a file.');
  if (file.size > 25 * 1024 * 1024) throw new HttpError(413, 'Files can be up to 25 MB.');
  const until = String(form.get('validUntil') ?? '');
  const data = new Uint8Array(await file.arrayBuffer());
  await prisma.vendorDocument.create({
    data: {
      vendorId: id, kind, title: String(form.get('title') ?? '').trim().slice(0, 200) || file.name, fileName: file.name.slice(0, 200),
      mimeType: file.type || 'application/octet-stream', fileSize: data.byteLength, fileData: Buffer.from(data), uploadedBy: user.email,
      validUntil: /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(`${until}T00:00:00Z`) : null,
    },
  });
  // Uploading an agreement marks it as signed.
  if (kind === 'dpa') await prisma.vendor.update({ where: { id }, data: { dpaSigned: true } });
  if (kind === 'baa') await prisma.vendor.update({ where: { id }, data: { baaSigned: true } });
  await logEvent({ action: 'Vendor document added', actor: user.email, decision: 'Completed', resource: vendor.name, reason: kind });
  return NextResponse.json({ ok: true });
});
