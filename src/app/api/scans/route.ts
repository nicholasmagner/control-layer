import { NextResponse } from 'next/server';
import { isProvider } from '@/checks';
import { handle, HttpError, requireUser } from '@/auth/session';
import { readJson } from '@/lib/http';
import { runScan } from '@/scan/run';

export const maxDuration = 300;

/** Runs a read-only scan of one connected cloud account. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  if (!isProvider(body.provider)) throw new HttpError(400, 'provider must be aws, gcp or azure.');
  const summary = await runScan(body.provider, { actor: user.email });
  return NextResponse.json(summary, { status: summary.ok ? 200 : 502 });
});
