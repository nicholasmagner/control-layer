import { handle, HttpError, requireUser } from '@/auth/session';
import { prisma } from '@/db/prisma';
import { buildAuditPackage } from '@/evidence/package';
import { verifyEvidenceChain } from '@/evidence/store';
import { DEFAULT_FRESHNESS_DAYS, getFramework } from '@/frameworks';
import { logEvent } from '@/lib/events';
import { organizationName } from '@/lib/settings';

export const maxDuration = 120;

function parseDay(value: string | null, fallback: Date): Date {
  if (!value) return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, 'Dates must look like 2026-01-31.');
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new HttpError(400, 'Invalid date.');
  return d;
}

/**
 * GET /api/evidence/export?framework=SOC2&from=2026-01-01&to=2026-12-31
 * Downloads the audit evidence package (ZIP) for one framework and period.
 * Available to every role, including auditors.
 */
export const GET = handle(async (req: Request) => {
  const user = await requireUser(req, 'export');
  const url = new URL(req.url);
  const framework = getFramework(url.searchParams.get('framework') ?? 'SOC2');
  if (!framework) throw new HttpError(400, 'Unknown framework.');

  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const from = parseDay(url.searchParams.get('from'), new Date(today.getTime() - 365 * 86_400_000));
  const toStart = parseDay(url.searchParams.get('to'), today);
  const to = new Date(toStart.getTime() + 86_400_000 - 1); // inclusive end of day
  if (from > to) throw new HttpError(400, '"from" must be before "to".');

  // Sample evidence is only exported when the workspace has nothing real.
  const realEvidence = await prisma.evidenceArtifact.count({ where: { isSample: false } });
  const isSample = realEvidence === 0;

  const controls = await prisma.control.findMany({
    where: { framework: framework.id },
    include: {
      scores: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
      evidence: {
        where: { evidence: { isSample } },
        include: { evidence: true },
      },
    },
  });
  const byId = new Map(controls.map(c => [c.controlId, c]));

  const packageControls = framework.controls.map(def => {
    const row = byId.get(def.id);
    const freshnessMs = (def.freshnessDays ?? DEFAULT_FRESHNESS_DAYS) * 86_400_000;
    const evidence = (row?.evidence ?? [])
      .map(l => l.evidence)
      .filter(e => e.kind === 'automated'
        ? e.collectedAt >= from && e.collectedAt <= to
        // Documents count if they were current at any point during the period.
        : e.collectedAt <= to && e.collectedAt.getTime() >= from.getTime() - freshnessMs)
      .sort((a, b) => a.seq - b.seq)
      .map(e => ({ ...e, fileData: e.fileData ? new Uint8Array(e.fileData) : null }));
    const score = row?.scores[0];
    return {
      controlId: def.id, title: def.title, description: def.description, category: def.category,
      status: row && !row.applicable ? 'Not Applicable' : score?.status ?? 'Not assessed',
      justification: row && !row.applicable ? row.naReason ?? '' : score?.justification ?? '',
      owner: row?.owner ?? null,
      expectedEvidence: def.evidence,
      evidence,
    };
  });

  const [findings, events, chain] = await Promise.all([
    prisma.finding.findMany({
      where: { isSample, createdAt: { lte: to }, OR: [{ resolvedAt: null }, { resolvedAt: { gte: from } }] },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.eventLog.findMany({ where: { timestamp: { gte: from, lte: to } }, orderBy: { timestamp: 'asc' } }),
    verifyEvidenceChain(),
  ]);

  const { zip, fileName } = await buildAuditPackage({
    framework,
    organization: organizationName(),
    period: { from, to },
    generatedAt: new Date(),
    generatedBy: `${user.name} <${user.email}>`,
    isSample,
    controls: packageControls,
    findings,
    events,
    chain,
  });

  await logEvent({
    action: 'Audit package exported', actor: user.email, decision: 'Completed', resource: framework.name,
    reason: `Period ${from.toISOString().slice(0, 10)} to ${toStart.toISOString().slice(0, 10)}; ${packageControls.reduce((n, c) => n + c.evidence.length, 0)} evidence file(s).`,
  });

  return new Response(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
});
