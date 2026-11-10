import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { email, githubName, optionalDate, readJson, str } from '@/lib/http';

/** Adds a person (employee or contractor) to the people directory. */
export const POST = handle(async (req: Request) => {
  const user = await requireUser(req, 'edit');
  const body = await readJson(req);
  const address = email(body.email);
  if (await prisma.person.findUnique({ where: { email: address } })) throw new HttpError(409, 'Someone with that email is already in the list.');
  const person = await prisma.person.create({
    data: {
      name: str(body.name, 'name', { max: 100 }),
      email: address,
      title: str(body.title, 'title', { max: 100, required: false }) || null,
      githubUsername: githubName(body.githubUsername),
      startDate: optionalDate(body.startDate, 'start date'),
      source: 'manual',
    },
  });
  await logEvent({ action: 'Person added', actor: user.email, decision: 'Completed', resource: address });
  return NextResponse.json({ id: person.id });
});
