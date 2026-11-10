import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { recomputeAssessments } from '@/assessment/engine';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson, str, type RouteParams } from '@/lib/http';

/** Set a control's owner, or mark it Not Applicable (with a reason auditors will read). */
export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const control = await prisma.control.findUnique({ where: { id } });
  if (!control) throw new HttpError(404, 'Control not found.');

  const data: { applicable?: boolean; naReason?: string | null; owner?: string | null } = {};
  if (body.applicable !== undefined) {
    if (typeof body.applicable !== 'boolean') throw new HttpError(400, '"applicable" must be true or false.');
    data.applicable = body.applicable;
    if (!body.applicable) {
      data.naReason = str(body.naReason, 'naReason', { max: 1000 });
    } else {
      data.naReason = null;
    }
  }
  if (body.owner !== undefined) data.owner = str(body.owner, 'owner', { max: 200, required: false }) || null;

  await prisma.control.update({ where: { id }, data });
  await recomputeAssessments();
  await logEvent({
    action: data.applicable === false ? 'Control marked not applicable' : data.applicable ? 'Control marked applicable' : 'Control owner changed',
    actor: user.email, decision: 'Completed', resource: `${control.framework} ${control.controlId}`,
    reason: data.naReason ?? (data.owner !== undefined ? `Owner: ${data.owner ?? 'none'}` : undefined),
  });
  return NextResponse.json({ ok: true });
});
