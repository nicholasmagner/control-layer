import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { email, publicOrigin, readJson, type RouteParams } from '@/lib/http';
import { sendVendorQuestionnaire } from '@/vendors/service';

/** Creates a link the vendor uses to answer a short security questionnaire (no account needed). */
export const POST = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const body = await readJson(req);
  const url = await sendVendorQuestionnaire(id, email(body.email), user.email, publicOrigin(req));
  return NextResponse.json({ url });
});
