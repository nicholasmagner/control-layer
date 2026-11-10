import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { isProvider } from '@/checks';
import { signedInChoices } from '@/connectors/discover';
import type { RouteParams } from '@/lib/http';

/** Accounts / projects / subscriptions visible after a browser sign-in. */
export const GET = handle(async (req: Request, { params }: RouteParams<'provider'>) => {
  await requireUser(req, 'admin');
  const { provider } = await params;
  if (!isProvider(provider)) throw new HttpError(404, 'Unknown integration.');
  try {
    return NextResponse.json({ choices: await signedInChoices(provider) });
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err));
  }
});
