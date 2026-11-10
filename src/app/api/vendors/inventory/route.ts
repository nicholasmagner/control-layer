import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { snapshotInventory } from '@/vendors/service';

/** Saves today's vendor inventory as evidence. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  return NextResponse.json({ count: await snapshotInventory(user.email) });
});
