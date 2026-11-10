import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson, str, type RouteParams } from '@/lib/http';

export const GET = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  await requireUser(req, 'view');
  const { id } = await params;
  const q = await prisma.questionnaire.findUnique({
    where: { id },
    select: {
      id: true, name: true, customer: true, dueDate: true, status: true, fileName: true, sheetName: true, createdBy: true, createdAt: true,
      items: { orderBy: { position: 'asc' } },
    },
  });
  if (!q) throw new HttpError(404, 'Questionnaire not found.');
  return NextResponse.json(q);
});

export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const data: Record<string, unknown> = {};
  if ('name' in body) data.name = str(body.name, 'name', { max: 150 });
  if ('customer' in body) data.customer = str(body.customer, 'customer', { max: 150, required: false }) || null;
  if ('dueDate' in body) data.dueDate = typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? new Date(`${body.dueDate}T00:00:00Z`) : null;
  if ('status' in body) {
    if (body.status !== 'in_progress' && body.status !== 'completed') throw new HttpError(400, 'Invalid status.');
    data.status = body.status;
  }
  const q = await prisma.questionnaire.update({ where: { id }, data }).catch(() => { throw new HttpError(404, 'Questionnaire not found.'); });
  if (data.status === 'completed') await logEvent({ action: 'Questionnaire completed', actor: user.email, decision: 'Completed', resource: q.name, reason: q.customer ?? undefined });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const q = await prisma.questionnaire.delete({ where: { id } }).catch(() => { throw new HttpError(404, 'Questionnaire not found.'); });
  await logEvent({ action: 'Questionnaire removed', actor: user.email, decision: 'Completed', resource: q.name });
  return NextResponse.json({ ok: true });
});
