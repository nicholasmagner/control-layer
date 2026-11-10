import { NextResponse } from 'next/server';
import { getCurrentUser, handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { safeName } from '@/evidence/package';
import { logEvent } from '@/lib/events';
import { readJson, str, type RouteParams } from '@/lib/http';
import { loadTrustConfig } from '@/trust/config';
import { requestForToken } from '@/trust/public';

/**
 * Downloads a Trust Center document. Public documents: anyone, while the
 * Trust Center is published. Others: with a valid access link (?token=), or
 * when signed in to ControlLayer. Always a download, never shown inline.
 */
export const GET = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const { id } = await params;
  const doc = await prisma.trustDocument.findUnique({ where: { id } });
  if (!doc) throw new HttpError(404, 'Document not found.');
  const signedIn = !!(await getCurrentUser());
  if (!signedIn) {
    if (!(await loadTrustConfig()).enabled) throw new HttpError(404, 'Document not found.');
    if (doc.access !== 'public') {
      const request = await requestForToken(new URL(req.url).searchParams.get('token'));
      if (!request) throw new HttpError(403, 'This document is shared on request. Your access link may have expired.');
      await prisma.trustRequest.update({ where: { id: request.id }, data: { lastUsedAt: new Date() } });
      await logEvent({ action: 'Trust Center document downloaded', actor: request.email, decision: 'Completed', resource: doc.title, reason: request.company });
    }
  }
  const name = safeName(doc.fileName, 150);
  return new Response(new Uint8Array(doc.fileData), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});

export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  await requireUser(req, 'admin');
  const { id } = await params;
  const body = await readJson(req);
  const data: Record<string, unknown> = {};
  if ('title' in body) data.title = str(body.title, 'title', { max: 150 });
  if ('description' in body) data.description = str(body.description, 'description', { max: 1000, required: false }) || null;
  if ('access' in body) data.access = body.access === 'public' ? 'public' : 'request';
  await prisma.trustDocument.update({ where: { id }, data }).catch(() => { throw new HttpError(404, 'Document not found.'); });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const doc = await prisma.trustDocument.findUnique({ where: { id }, select: { title: true } });
  if (!doc) throw new HttpError(404, 'Document not found.');
  await prisma.trustDocument.delete({ where: { id } });
  await logEvent({ action: 'Trust Center document removed', actor: user.email, decision: 'Completed', resource: doc.title });
  return NextResponse.json({ ok: true });
});
