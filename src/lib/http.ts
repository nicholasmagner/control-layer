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
