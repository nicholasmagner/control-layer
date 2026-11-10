import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { safeName } from '@/evidence/package';
import type { RouteParams } from '@/lib/http';

/** Downloads one evidence item (the original file, or the JSON record). */
export const GET = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  await requireUser(req, 'view');
  const { id } = await params;
  const e = await prisma.evidenceArtifact.findUnique({ where: { id } });
  if (!e) throw new HttpError(404, 'Evidence not found.');

  const name = e.fileName ? safeName(e.fileName, 150) : `${safeName(e.title, 100)}.json`;
  const body = e.fileData
    ? new Uint8Array(e.fileData)
    : new TextEncoder().encode(JSON.stringify({
      title: e.title, description: e.description, source: e.source, kind: e.kind,
      collectedAt: e.collectedAt, collectedBy: e.collectedBy, fingerprint: e.sha256, content: e.content,
    }, null, 2));

  return new Response(body, {
    headers: {
      // Always download, never render inline: uploaded HTML/SVG must not run in our origin.
      'Content-Type': e.fileData ? 'application/octet-stream' : 'application/json',
      'Content-Disposition': `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
});
