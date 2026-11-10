import { NextResponse } from 'next/server';
import { handle, HttpError, requireUser } from '@/auth/session';
import { Assistant } from '@/assistant/engine';
import { isValidHistory, MAX_MESSAGE_LENGTH, MAX_MESSAGES } from '@/assistant/validate';
import { prisma } from '@/db/prisma';
import { readJson } from '@/lib/http';

export const POST = handle(async (req: Request) => {
  await requireUser(req, 'view');
  const { messages } = await readJson<{ messages?: unknown }>(req);
  if (!isValidHistory(messages)) {
    throw new HttpError(400, `Expected { messages: {role, content}[] } with at most ${MAX_MESSAGES} messages of ${MAX_MESSAGE_LENGTH} characters.`);
  }

  // The server builds the context itself; the client only sends conversation text.
  const [controls, findings, runs] = await Promise.all([
    prisma.control.findMany({
      select: {
        framework: true, controlId: true, name: true, applicable: true,
        scores: { orderBy: { evaluatedAt: 'desc' }, take: 1, select: { status: true, justification: true } },
      },
    }),
    prisma.finding.findMany({
      where: { status: 'Open' }, orderBy: { createdAt: 'desc' }, take: 20,
      select: { title: true, severity: true, description: true, provider: true, remediation: true },
    }),
    prisma.checkRun.findMany({ orderBy: { startedAt: 'desc' }, take: 6, select: { provider: true, status: true, startedAt: true } }),
  ]);
  const notMet = controls
    .filter(c => c.scores[0] && c.scores[0].status !== 'Met' && c.scores[0].status !== 'Not Applicable')
    .map(c => ({ framework: c.framework, control: c.controlId, name: c.name, status: c.scores[0].status, reason: c.scores[0].justification }));
  const counts = controls.reduce<Record<string, number>>((m, c) => {
    const s = c.applicable ? c.scores[0]?.status ?? 'Not assessed' : 'Not Applicable';
    const k = `${c.framework}: ${s}`;
    return { ...m, [k]: (m[k] ?? 0) + 1 };
  }, {});

  const reply = await Assistant.chat(messages, { controlStatusCounts: counts, controlsNotMet: notMet.slice(0, 40), openFindings: findings, recentScans: runs });
  return NextResponse.json({ reply });
});
