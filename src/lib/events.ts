import { Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma';

/** Records an entry in the activity log (who did what, when). */
export async function logEvent(e: {
  action: string;
  actor: string;
  decision: string;
  resource?: string;
  reason?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  await prisma.eventLog.create({ data: e });
}
