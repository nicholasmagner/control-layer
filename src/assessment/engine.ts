import { ALL_CHECKS, PROVIDER_IDS } from '@/checks';
import { prisma } from '@/db/prisma';
import { DEFAULT_FRESHNESS_DAYS, FRAMEWORKS, getControlDef, type FrameworkId } from '@/frameworks';
import { expandControlKeys } from '@/frameworks/crosswalk';
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
 * Control row ids plus their crosswalked equivalents (SOC 2 -> ISO 27001,
 * HIPAA, GDPR), so one piece of evidence counts everywhere it applies.
 */
export async function withCrosswalk(controlIds: string[]): Promise<string[]> {
  if (!controlIds.length) return controlIds;
  const rows = await prisma.control.findMany({ where: { id: { in: controlIds } }, select: { framework: true, controlId: true } });
  const extra = expandControlKeys(rows.map(r => `${r.framework}:${r.controlId}`))
    .map(k => { const i = k.indexOf(':'); return { framework: k.slice(0, i), controlId: k.slice(i + 1) }; });
  if (extra.length === rows.length) return controlIds;
  const targets = await prisma.control.findMany({ where: { OR: extra }, select: { id: true } });
  return [...new Set([...controlIds, ...targets.map(t => t.id)])];
}

/** Links existing evidence to crosswalked controls (after new frameworks are added). Idempotent. */
export async function backfillCrosswalkLinks() {
  const soc2 = await prisma.control.findMany({ where: { framework: 'SOC2' }, select: { id: true, controlId: true } });
  const all = await prisma.control.findMany({ select: { id: true, framework: true, controlId: true } });
  const byKey = new Map(all.map(c => [`${c.framework}:${c.controlId}`, c.id]));
  let added = 0;
  for (const c of soc2) {
    const targets = expandControlKeys([`SOC2:${c.controlId}`]).map(k => byKey.get(k)).filter((x): x is string => !!x && x !== c.id);
    if (!targets.length) continue;
    const links = await prisma.evidenceControl.findMany({ where: { controlId: c.id }, select: { evidenceId: true } });
    if (!links.length) continue;
    const res = await prisma.evidenceControl.createMany({
      data: links.flatMap(l => targets.map(t => ({ evidenceId: l.evidenceId, controlId: t }))), skipDuplicates: true,
    });
    added += res.count;
  }
  return added;
}

/**
 * Latest outcome of every check: taken from the most recent finished run of
 * each provider (sample runs only count when no real run exists).
 */
export async function latestCheckOutcomes(): Promise<Map<string, CheckOutcome>> {
  const outcomes = new Map<string, CheckOutcome>();
  const realRuns = await prisma.checkRun.count({ where: { isSample: false, status: { in: ['success', 'partial'] } } });

  for (const provider of PROVIDER_IDS) {
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
      (e.evidence.kind === 'upload' || e.evidence.kind === 'note') &&
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
