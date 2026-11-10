import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { email, githubName, optionalDate, readJson, str, type RouteParams } from '@/lib/http';

/** Edits a person. { endDate } marks them as having left (null = active again). */
export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) throw new HttpError(404, 'Person not found.');
  const data: Record<string, unknown> = {};
  if ('name' in body) data.name = str(body.name, 'name', { max: 100 });
  if ('email' in body) {
    data.email = email(body.email);
    const other = await prisma.person.findUnique({ where: { email: data.email as string } });
    if (other && other.id !== id) throw new HttpError(409, 'Someone else already has that email.');
  }
  if ('title' in body) data.title = str(body.title, 'title', { max: 100, required: false }) || null;
  if ('githubUsername' in body) data.githubUsername = githubName(body.githubUsername);
  if ('startDate' in body) data.startDate = optionalDate(body.startDate, 'start date');
  if ('endDate' in body) {
    data.endDate = optionalDate(body.endDate, 'end date');
    if (data.endDate) data.signTokenHash = null;
  }
  await prisma.person.update({ where: { id }, data });
  if ('endDate' in body) {
    await logEvent({ action: data.endDate ? 'Person marked as left' : 'Person marked as active', actor: user.email, decision: 'Completed', resource: person.email });
  }
  return NextResponse.json({ ok: true });
});

/** Removes a person and their sign-off records. Prefer marking them as left. */
export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'admin');
  const { id } = await params;
  const person = await prisma.person.findUnique({ where: { id } });
  if (!person) throw new HttpError(404, 'Person not found.');
  await prisma.person.delete({ where: { id } });
  await logEvent({ action: 'Person removed', actor: user.email, decision: 'Completed', resource: person.email });
  return NextResponse.json({ ok: true });
});
