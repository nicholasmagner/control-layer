import { NextResponse } from 'next/server';
import { hashPassword, passwordProblem } from '@/auth/password';
import { can, handle, HttpError, requireUser, ROLES, type Role } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson, type RouteParams } from '@/lib/http';

/**
 * Change a user's role (admins) or password (admins, or the user themselves).
 */
export const PATCH = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const actor = await requireUser(req);
  const { id } = await params;
  const isSelf = id === actor.id;
  const body = await readJson(req);

  if (!can.admin(actor) && (!isSelf || body.role !== undefined)) {
    throw new HttpError(403, 'Only admins can change other users or roles.');
  }
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, 'User not found.');

  const data: { role?: Role; passwordHash?: string } = {};
  if (body.role !== undefined) {
    if (!ROLES.includes(body.role as Role)) throw new HttpError(400, 'Role must be admin, member or auditor.');
    if (target.role === 'admin' && body.role !== 'admin' && (await prisma.user.count({ where: { role: 'admin' } })) <= 1) {
      throw new HttpError(400, 'There must be at least one admin.');
    }
    data.role = body.role as Role;
  }
  if (body.password !== undefined) {
    const problem = passwordProblem(body.password);
    if (problem) throw new HttpError(400, problem);
    data.passwordHash = await hashPassword(body.password as string);
  }
  if (!data.role && !data.passwordHash) throw new HttpError(400, 'Nothing to change.');

  await prisma.user.update({ where: { id }, data });
  // A password reset by an admin signs the user out everywhere.
  if (data.passwordHash && !isSelf) await prisma.session.deleteMany({ where: { userId: id } });
  await logEvent({
    action: data.role ? 'User role changed' : 'Password changed', actor: actor.email, decision: 'Completed',
    resource: target.email, reason: data.role ? `New role: ${data.role}` : undefined,
  });
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const actor = await requireUser(req, 'admin');
  const { id } = await params;
  if (id === actor.id) throw new HttpError(400, 'You cannot remove yourself.');
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) throw new HttpError(404, 'User not found.');
  await prisma.user.delete({ where: { id } });
  await logEvent({ action: 'User removed', actor: actor.email, decision: 'Completed', resource: target.email });
  return NextResponse.json({ ok: true });
});
