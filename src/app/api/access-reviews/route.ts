import { NextResponse } from 'next/server';
import { createReview } from '@/access/service';
import { handle, HttpError, requireUser } from '@/auth/session';
import { optionalDate, readJson, str } from '@/lib/http';

/** Starts an access review from the latest account lists (plus an optional CSV for another system). */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  const providers = Array.isArray(body.providers) ? body.providers.map(String) : [];
  const extraCsv = typeof body.extraCsv === 'string' && body.extraCsv.trim() ? body.extraCsv : null;
  if (extraCsv && extraCsv.length > 2_000_000) throw new HttpError(400, 'The CSV is too large (2 MB max).');
  const id = await createReview({
    name: str(body.name, 'name', { max: 150 }),
    providers,
    dueDate: optionalDate(body.dueDate, 'due date'),
    extra: extraCsv ? { system: str(body.extraSystem, 'system name', { max: 100 }), csv: extraCsv } : undefined,
  }, user.email);
  return NextResponse.json({ id });
});
