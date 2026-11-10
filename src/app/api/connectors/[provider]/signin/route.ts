import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { isProvider } from '@/checks';
import { answerSignin, cancelSignin, getSignin, startSignin } from '@/connectors/cli';
import { logEvent } from '@/lib/events';
import { readJson, type RouteParams } from '@/lib/http';

/**
 * Browser sign-in through the cloud's CLI.
 *   POST {action:'start', awsRegion?} -> starts it (the browser opens)
 *   POST {action:'input', job, text}  -> answers a prompt (e.g. pastes a code)
 *   POST {action:'cancel', job}
 *   GET  ?job=<id>                     -> progress, links and codes to show
 */
export const POST = handle(async (req: Request, { params }: RouteParams<'provider'>) => {
  const user = await requireUser(req, 'admin');
  const { provider } = await params;
  if (!isProvider(provider)) throw new HttpError(404, 'Unknown cloud.');
  const body = await readJson<{ action?: string; job?: string; text?: string; awsRegion?: string }>(req);

  if (body.action === 'start') {
    try {
      const job = await startSignin(provider, { awsRegion: body.awsRegion });
      await logEvent({ action: 'Cloud sign-in started', actor: user.email, decision: 'Started', resource: provider });
      return NextResponse.json(job);
    } catch (err) {
      throw new HttpError(400, err instanceof Error ? err.message : String(err));
    }
  }
  if (typeof body.job !== 'string' || !getSignin(body.job)) throw new HttpError(404, 'Sign-in not found.');
  if (body.action === 'input') {
    if (typeof body.text !== 'string' || body.text.length > 4000) throw new HttpError(400, 'Nothing to send.');
    answerSignin(body.job, body.text);
  } else if (body.action === 'cancel') {
    cancelSignin(body.job);
  } else {
    throw new HttpError(400, 'Unknown action.');
  }
  return NextResponse.json(getSignin(body.job));
});

export const GET = handle(async (req: Request) => {
  await requireUser(req, 'admin');
  const id = new URL(req.url).searchParams.get('job') ?? '';
  const job = getSignin(id);
  if (!job) throw new HttpError(404, 'Sign-in not found.');
  return NextResponse.json(job);
});
