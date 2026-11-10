import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { clearSampleData, loadSampleData } from '@/scan/run';

/** Loads a sample company (AWS, Google Cloud and Azure) to explore the product. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const summaries = await loadSampleData(user.email);
  return NextResponse.json({ ok: true, summaries });
});

export const DELETE = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const removed = await clearSampleData({ actor: user.email });
  return NextResponse.json({ ok: true, removed });
});
