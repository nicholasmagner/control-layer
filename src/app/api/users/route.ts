import { NextResponse } from 'next/server';
import { hashPassword, passwordProblem } from '@/auth/password';
import { handle, HttpError, requireUser, ROLES, type Role } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { email, readJson, str } from '@/lib/http';

/** Admins add teammates and auditors. Share the initial password with them directly. */
export const POST = handle(async (req: Request) => {
  const admin = await requireUser(req, 'admin');
  const body = await readJson(req);
  const name = str(body.name, 'name', { max: 100 });
  const address = email(body.email);
  const role = body.role as Role;
  if (!ROLES.includes(role)) throw new HttpError(400, 'Role must be admin, member or auditor.');
  const problem = passwordProblem(body.password);
  if (problem) throw new HttpError(400, problem);
  if (await prisma.user.findUnique({ where: { email: address } })) throw new HttpError(409, 'A user with that email already exists.');

  const user = await prisma.user.create({
    data: { name, email: address, role, passwordHash: await hashPassword(body.password as string) },
    select: { id: true, name: true, email: true, role: true },
  });
  await logEvent({ action: 'User added', actor: admin.email, decision: 'Completed', resource: address, reason: `Role: ${role}` });
  return NextResponse.json({ user });
});
