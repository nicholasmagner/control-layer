import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { gworkspaceConnection, m365Connection } from '@/connectors/config';
import { describeError } from '@/connectors/common';
import { collectGworkspace } from '@/connectors/gworkspace';
import { collectM365 } from '@/connectors/m365';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { readJson } from '@/lib/http';

/**
 * Imports people from the connected Google Workspace or Microsoft 365
 * directory: every active, non-guest account. Existing people (same email)
 * keep their details; nobody is removed or marked as left automatically.
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  const provider = body.provider;
  if (provider !== 'gworkspace' && provider !== 'm365') throw new HttpError(400, 'Choose Google Workspace or Microsoft 365.');

  let users;
  try {
    if (provider === 'gworkspace') {
      const c = await gworkspaceConnection();
      if (!c) throw new HttpError(400, 'Connect Google Workspace first (Integrations).');
      users = (await collectGworkspace(c)).inventory.users;
    } else {
      const c = await m365Connection();
      if (!c) throw new HttpError(400, 'Connect Microsoft 365 first (Integrations).');
      users = (await collectM365(c)).inventory.users;
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(502, `Could not read the directory: ${describeError(err)}`);
  }
  if (!users) throw new HttpError(502, 'Could not read the user list. Check the connection permissions.');

  const existing = new Set((await prisma.person.findMany({ select: { email: true } })).map(p => p.email));
  const fresh = users.filter(u => u.active && !u.guest && u.email.includes('@') && !existing.has(u.email));
  if (fresh.length) {
    await prisma.person.createMany({
      data: fresh.map(u => ({ name: u.name.slice(0, 100), email: u.email, source: provider, startDate: u.createdAt ? new Date(u.createdAt) : null })),
      skipDuplicates: true,
    });
  }
  await logEvent({ action: 'People imported', actor: user.email, decision: 'Completed', resource: `${fresh.length} added`, reason: provider === 'gworkspace' ? 'From Google Workspace' : 'From Microsoft 365' });
  return NextResponse.json({ added: fresh.length, skipped: users.length - fresh.length });
});
