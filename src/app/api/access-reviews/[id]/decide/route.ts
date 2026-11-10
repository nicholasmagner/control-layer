import { NextResponse } from 'next/server';
import { decide } from '@/access/service';
import { handle, HttpError, requireUser } from '@/auth/session';
import { readJson, str, type RouteParams } from '@/lib/http';

/** Records keep / remove / change for one or more accounts. */
export const POST = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  if (!Array.isArray(body.itemIds) || !body.itemIds.length) throw new HttpError(400, 'Choose accounts.');
  const note = str(body.note, 'note', { max: 1000, required: false }) || null;
  const count = await decide(id, body.itemIds.map(String), String(body.decision), note, user.email);
  return NextResponse.json({ count });
});
