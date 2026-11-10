import { createHash, randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { prisma } from '@/db/prisma';

export type Role = 'admin' | 'member' | 'auditor';
export const ROLES: Role[] = ['admin', 'member', 'auditor'];

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export const SESSION_COOKIE = 'cl_session';
const SESSION_DAYS = 7;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && process.env.INSECURE_COOKIES !== 'true',
    path: '/',
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { select: { id: true, email: true, name: true, role: true } } },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return { ...session.user, role: session.user.role as Role };
}

export async function userCount() {
  return prisma.user.count();
}

/** What each role may do. Auditors are read-only but can export evidence. */
export const can = {
  view: (u: CurrentUser) => !!u,
  export: (u: CurrentUser) => !!u,
  edit: (u: CurrentUser) => u.role === 'admin' || u.role === 'member',
  admin: (u: CurrentUser) => u.role === 'admin',
};

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * For route handlers: returns the signed-in user or throws HttpError.
 * Mutating requests must also come from this site (Origin check), on top of
 * the SameSite=Lax session cookie.
 */
export async function requireUser(req: Request, permission: keyof typeof can = 'view'): Promise<CurrentUser> {
  if (req.method !== 'GET' && req.method !== 'HEAD') assertSameOrigin(req);
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, 'Please sign in.');
  if (!can[permission](user)) throw new HttpError(403, 'Your role does not allow this action.');
  return user;
}

export function assertSameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return; // non-browser clients (curl, scripts) don't send Origin
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  try {
    if (new URL(origin).host !== host) throw new HttpError(403, 'Cross-site request blocked.');
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(403, 'Cross-site request blocked.');
  }
}

/** Wraps a route handler so HttpErrors become JSON responses. */
export function handle<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) return NextResponse.json({ error: err.message }, { status: err.status });
      console.error(err);
      return NextResponse.json({ error: 'Something went wrong. Check the server logs.' }, { status: 500 });
    }
  };
}

/** Simple in-memory limiter for sign-in attempts (per email + IP). */
const attempts = new Map<string, { count: number; resetAt: number }>();
export function tooManyAttempts(key: string, max = 10, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  entry.count++;
  return entry.count > max;
}
export function clearAttempts(key: string) {
  attempts.delete(key);
}
