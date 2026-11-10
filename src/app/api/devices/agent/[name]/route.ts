import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { handle, HttpError } from '@/auth/session';
import type { RouteParams } from '@/lib/http';

const FILES = new Set(['controllayer-agent.sh', 'controllayer-agent.ps1']);

/**
 * Serves the agent scripts as plain text, so `curl | bash` and
 * PowerShell's `irm` can fetch them. They contain no secrets.
 */
export const GET = handle(async (_req: Request, { params }: RouteParams<'name'>) => {
  const { name } = await params;
  if (!FILES.has(name)) throw new HttpError(404, 'Not found.');
  const body = await readFile(path.join(process.cwd(), 'assets', 'agent', name), 'utf8');
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `inline; filename="${name}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache',
    },
  });
});
