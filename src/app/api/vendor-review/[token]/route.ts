import { NextResponse } from 'next/server';
import { assertSameOrigin, handle, HttpError, tooManyAttempts } from '@/auth/session';
import { clientIp, type RouteParams } from '@/lib/http';
import type { VendorAnswer } from '@/vendors/risk';
import { submitVendorQuestionnaire } from '@/vendors/service';

/** Public: a vendor submits their answers (multipart: answers JSON, respondent, file?). */
export const POST = handle(async (req: Request, { params }: RouteParams<'token'>) => {
  assertSameOrigin(req);
  if (tooManyAttempts(`vendor-review:${clientIp(req) ?? 'unknown'}`, 20, 60 * 60_000)) throw new HttpError(429, 'Too many attempts. Try again later.');
  const { token } = await params;
  const form = await req.formData().catch(() => { throw new HttpError(400, 'Expected a form submission.'); });
  let answers: Record<string, VendorAnswer>;
  try {
    answers = JSON.parse(String(form.get('answers') ?? '{}'));
  } catch {
    throw new HttpError(400, 'Invalid answers.');
  }
  const respondent = String(form.get('respondent') ?? '').trim().slice(0, 200);
  if (respondent.length < 3) throw new HttpError(400, 'Enter your name and email.');
  const file = form.get('file');
  let report;
  if (file instanceof File && file.size) {
    if (file.size > 25 * 1024 * 1024) throw new HttpError(413, 'Files can be up to 25 MB.');
    report = { name: file.name.slice(0, 200), mimeType: file.type || 'application/octet-stream', data: new Uint8Array(await file.arrayBuffer()) };
  }
  const score = await submitVendorQuestionnaire(token, answers, respondent, report);
  return NextResponse.json({ ok: true, score });
});
