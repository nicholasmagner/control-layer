import { HttpError } from '@/auth/session';

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as T;
  } catch {
    throw new HttpError(400, 'Expected a JSON object in the request body.');
  }
}

export function str(value: unknown, field: string, { max = 500, required = true } = {}): string {
  if (typeof value !== 'string' || (required && value.trim() === '')) {
    if (!required && (value === undefined || value === null || value === '')) return '';
    throw new HttpError(400, `"${field}" is required.`);
  }
  if (value.length > max) throw new HttpError(400, `"${field}" is too long (max ${max} characters).`);
  return value.trim();
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function email(value: unknown): string {
  const v = str(value, 'email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new HttpError(400, 'Enter a valid email address.');
  return v;
}

export type RouteParams<K extends string> = { params: Promise<Record<K, string>> };

/** The address people use to reach this server (for links we hand out). */
export function publicOrigin(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto.split(',')[0].trim()}://${host.split(',')[0].trim()}`;
}

/** Best-effort client IP for records (first X-Forwarded-For hop). */
export function clientIp(req: Request): string | null {
  const fwd = req.headers.get('x-forwarded-for');
  return (fwd ? fwd.split(',')[0].trim() : req.headers.get('x-real-ip')) || null;
}

export function optionalDate(value: unknown, field: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(value)) throw new HttpError(400, `"${field}" must be a date like 2026-01-31.`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, `"${field}" is not a valid date.`);
  return d;
}

export const githubName = (value: unknown) => {
  const v = str(value, 'GitHub username', { max: 39, required: false }).replace(/^@/, '');
  if (v && !/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(v)) throw new HttpError(400, 'That is not a valid GitHub username.');
  return v || null;
};

