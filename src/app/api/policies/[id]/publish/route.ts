import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import type { RouteParams } from '@/lib/http';
import { publishPolicy } from '@/policies/service';

/** Publishes the draft as a new version that people can sign. */
export const POST = handle(async (req: Request, { params }: RouteParams<'id'>) => {
  const user = await requireUser(req, 'edit');
  const { id } = await params;
  const version = await publishPolicy(id, user.email);
  return NextResponse.json({ version: version.version });
});
