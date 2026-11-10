import { ALL_CHECKS } from '@/checks';
import { prisma } from '@/db/prisma';
import { DEFAULT_FRESHNESS_DAYS, FRAMEWORKS, getControlDef, type FrameworkId } from '@/frameworks';
import { computeStatus, type CheckOutcome } from './status';

/** Inserts / updates the Control table from the framework catalog. */
export async function syncControls() {
  for (const fw of FRAMEWORKS) {
    for (const c of fw.controls) {
      await prisma.control.upsert({
        where: { framework_controlId: { framework: fw.id, controlId: c.id } },
        create: { framework: fw.id, controlId: c.id, name: c.title, description: c.description, category: c.category },
        update: { name: c.title, description: c.description, category: c.category },
      });
    }
  }
}

/**
 * Latest outcome of every check: taken from the most recent finished run of
 * each provider (sample runs only count when no real run exists).
 */
export async function latestCheckOutcomes(): Promise<Map<string, CheckOutcome>> {
  const outcomes = new Map<string, CheckOutcome>();
  const realRuns = await prisma.checkRun.count({ where: { isSample: false, status: { in: ['success', 'partial'] } } });

  for (const provider of ['aws', 'gcp', 'azure']) {
    const run = await prisma.checkRun.findFirst({
      where: { provider, status: { in: ['success', 'partial'] }, ...(realRuns > 0 ? { isSample: false } : {}) },
      orderBy: { startedAt: 'desc' },
      select: { id: true },
    });
    if (!run) continue;
    const grouped = await prisma.checkResult.groupBy({ by: ['checkId', 'status'], where: { runId: run.id }, _count: true });
    for (const g of grouped) {
      const def = ALL_CHECKS.find(c => c.id === g.checkId);
      const o = outcomes.get(g.checkId) ?? { checkId: g.checkId, title: def?.title ?? g.checkId, passed: 0, failed: 0 };
      if (g.status === 'pass') o.passed += g._count; else o.failed += g._count;
      outcomes.set(g.checkId, o);
    }
  }
  return outcomes;
}

/**
 * Recomputes every control's status. A new AssessmentScore row is written
 * only when the status or justification changed, so the table doubles as a
 * history of when each control started / stopped meeting its requirement.
 */
export async function recomputeAssessments() {
  const [controls, outcomes] = await Promise.all([
    prisma.control.findMany({
      include: {
        scores: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
        evidence: { include: { evidence: { select: { kind: true, collectedAt: true } } } },
      },
    }),
    latestCheckOutcomes(),
  ]);
  const now = Date.now();
  let changed = 0;

  for (const control of controls) {
    const def = getControlDef(control.framework, control.controlId);
    const freshnessMs = (def?.freshnessDays ?? DEFAULT_FRESHNESS_DAYS) * 86_400_000;
    const checks = ALL_CHECKS
      .filter(c => c.controls[control.framework as FrameworkId]?.includes(control.controlId))
      .map(c => outcomes.get(c.id))
      .filter((o): o is CheckOutcome => !!o);
    const currentManualEvidence = control.evidence.filter(e =>
      e.evidence.kind !== 'automated' &&
      now - e.evidence.collectedAt.getTime() <= freshnessMs,
    ).length;

    const { status, justification } = computeStatus({
      applicable: control.applicable, naReason: control.naReason, checks, currentManualEvidence,
    });
    const last = control.scores[0];
    if (!last || last.status !== status || last.justification !== justification) {
      await prisma.assessmentScore.create({ data: { controlId: control.id, status, justification } });
      changed++;
    }
  }
  return { changed };
}
