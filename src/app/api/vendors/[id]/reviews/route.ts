import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { readJson, str, type RouteParams } from '@/lib/http';
import { recordReview } from '@/vendors/service';

/** Records a vendor security review; it is saved as audit evidence. */
export const POST = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const checklist = Object.fromEntries(Object.entries((body.checklist ?? {}) as Record<string, unknown>).map(([k, v]) => [k.slice(0, 40), v === true]));
  await recordReview(id, { outcome: String(body.outcome), residualRisk: String(body.residualRisk), notes: str(body.notes, 'notes', { max: 5000, required: false }), checklist }, user.email);
  return NextResponse.json({ ok: true });
});
