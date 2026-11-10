import { NextResponse } from 'next/server';
import { handle, requireUser } from '@/auth/session';
import { verifyEvidenceChain } from '@/evidence/store';
import { logEvent } from '@/lib/events';

/** Re-fingerprints every evidence record and checks the hash chain. */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, 'view');
  const result = await verifyEvidenceChain();
  await logEvent({
    action: 'Evidence integrity check', actor: user.email, decision: result.ok ? 'Verified' : 'Failed',
    reason: result.ok ? `${result.checked} record(s) verified.` : result.problem?.reason,
  });
  return NextResponse.json(result);
});
