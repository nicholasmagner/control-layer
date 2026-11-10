import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson } from '@/lib/http';
import { parsePeopleCsv } from '@/policies/service';

/** Imports people from CSV text. Existing emails are updated, not duplicated. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  if (typeof body.csv !== 'string' || body.csv.length > 2_000_000) throw new HttpError(400, 'Paste or choose a CSV file (up to 2 MB).');
  const { people, errors } = parsePeopleCsv(body.csv);
  if (people.length > 5000) throw new HttpError(400, 'Import up to 5,000 people at a time.');
  let added = 0;
  let updated = 0;
  for (const p of people) {
    const existing = await prisma.person.findUnique({ where: { email: p.email } });
    if (existing) {
      await prisma.person.update({
        where: { id: existing.id },
        data: { name: p.name, title: p.title ?? existing.title, githubUsername: p.githubUsername ?? existing.githubUsername, startDate: p.startDate ?? existing.startDate },
      });
      updated++;
    } else {
      await prisma.person.create({ data: { ...p, source: 'csv' } });
      added++;
    }
  }
  await logEvent({ action: 'People imported', actor: user.email, decision: 'Completed', resource: `${added} added, ${updated} updated`, reason: errors.length ? `${errors.length} row(s) skipped` : undefined });
  return NextResponse.json({ added, updated, errors: errors.slice(0, 20) });
});
