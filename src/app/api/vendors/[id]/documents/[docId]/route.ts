import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { safeName } from '@/evidence/package';
import type { RouteParams } from '@/lib/http';

export const GET = handle(async (req: Request, { params }: RouteParams<'id' | 'docId'>) => {
  await requireUser(req, 'view');
  const { id, docId } = await params;
  const d = await prisma.vendorDocument.findFirst({ where: { id: docId, vendorId: id } });
  if (!d) throw new HttpError(404, 'Document not found.');
  const name = safeName(d.fileName, 150);
  return new Response(new Uint8Array(d.fileData), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store',
    },
  });
});

export const DELETE = handle(async (req: Request, { params }: RouteParams<'id' | 'docId'>) => {
  await requireUser(req, 'edit');
  const { id, docId } = await params;
  await prisma.vendorDocument.deleteMany({ where: { id: docId, vendorId: id } });
  return NextResponse.json({ ok: true });
});
