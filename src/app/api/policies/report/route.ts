import { handle, requireUser } from '@/auth/session';
import { csv } from '@/evidence/package';
import { acceptanceStatusRows } from '@/policies/service';

/** CSV of every active person's sign-off status for each published policy. */
export const GET = handle(async (req: Request) => {
  await requireUser(req, 'export');
  const rows = await acceptanceStatusRows();
  const body = csv([
    ['Person', 'Email', 'Policy', 'Current version', 'Status', 'Accepted at (UTC)'],
    ...rows.map(r => [r.person, r.email, r.policy, r.version, r.status, r.acceptedAt]),
  ]);
  return new Response(body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="policy-acceptance-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
