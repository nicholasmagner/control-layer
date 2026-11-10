import { checksFor, PROVIDERS, type Provider, type ResourceResult } from '@/checks';
import { recomputeAssessments, syncControls } from '@/assessment/engine';
import { collect } from '@/connectors';
import { describeError } from '@/connectors/common';
import { sampleInventory } from '@/connectors/sample';
import { prisma } from '@/db/prisma';
import { CHECK_DATA_SOURCES } from '@/checks/sources';
import { renderEvidenceCard } from '@/evidence/card';
import { canonicalJson, sha256Hex } from '@/evidence/hash';
import { anchorChain, appendEvidence } from '@/evidence/store';
import { FRAMEWORKS } from '@/frameworks';
import { logEvent } from '@/lib/events';
import { organizationName, snapshotIntervalDays } from '@/lib/settings';
import { APP_VERSION } from '@/lib/version';

export interface ScanSummary {
  provider: Provider;
  ok: boolean;
  runId: string;
  account?: string;
  checksEvaluated: number;
  checksSkipped: string[];
  passed: number;
  failed: number;
  newFindings: number;
  resolvedFindings: number;
  imagesCreated: number;
  warnings: string[];
  error?: string;
}

const providerName = (p: Provider) => PROVIDERS.find(x => x.id === p)?.name ?? p;

function controlLabels(controls: Partial<Record<string, string[]>>): string[] {
  return Object.entries(controls).flatMap(([fw, ids]) =>
    (ids ?? []).map(id => `${FRAMEWORKS.find(f => f.id === fw)?.shortName ?? fw} ${id}`));
}

/** Pass/fail per resource, ignoring wording that changes daily (e.g. key ages). */
export function resultsKey(results: ResourceResult[]): string {
  return sha256Hex(canonicalJson(results.map(r => [r.resourceId, r.status]).sort((a, b) => a[0].localeCompare(b[0]))));
}

/**
 * Decides whether this scan should produce a new evidence image for a check:
 * the first time, whenever pass/fail changed, and otherwise every
 * SNAPSHOT_INTERVAL_DAYS so a Type II period has a dated series.
 */
async function imageReason(provider: Provider, checkId: string, results: ResourceResult[], sample: boolean) {
  const key = resultsKey(results);
  const last = await prisma.evidenceArtifact.findFirst({
    where: { kind: 'snapshot', source: `${provider}:${checkId}`, isSample: sample },
    orderBy: { seq: 'desc' },
    select: { content: true, collectedAt: true },
  });
  if (!last) return { label: 'First evidence image for this check', resultsKey: key };
  if ((last.content as { resultsKey?: string } | null)?.resultsKey !== key) return { label: 'Result changed since the last image', resultsKey: key };
  const days = snapshotIntervalDays();
  if (Date.now() - last.collectedAt.getTime() >= days * 86_400_000) return { label: `Scheduled image (every ${days} days)`, resultsKey: key };
  return null;
}

async function controlRowIds(): Promise<Map<string, string>> {
  const rows = await prisma.control.findMany({ select: { id: true, framework: true, controlId: true } });
  return new Map(rows.map(r => [`${r.framework}:${r.controlId}`, r.id]));
}

export async function runScan(provider: Provider, opts: { actor: string; sample?: boolean }): Promise<ScanSummary> {
  const sample = !!opts.sample;
  await syncControls();

  const run = await prisma.checkRun.create({ data: { provider, isSample: sample } });
  const summary: ScanSummary = {
    provider, ok: false, runId: run.id, checksEvaluated: 0, checksSkipped: [], passed: 0, failed: 0,
    newFindings: 0, resolvedFindings: 0, imagesCreated: 0, warnings: [],
  };

  let collected;
  try {
    collected = sample ? sampleInventory(provider) : await collect(provider);
  } catch (err) {
    summary.error = describeError(err);
    await prisma.checkRun.update({ where: { id: run.id }, data: { status: 'error', error: summary.error, finishedAt: new Date() } });
    await logEvent({ action: `${providerName(provider)} scan`, actor: opts.actor, decision: 'Failed', reason: summary.error });
    return summary;
  }

  // The first successful real scan replaces the sample data.
  if (!sample) await clearSampleData({ actor: opts.actor, quiet: true });

  summary.account = collected.account;
  summary.warnings = collected.errors;
  const controlIds = await controlRowIds();

  for (const check of checksFor(provider)) {
    const results: ResourceResult[] | null = check.evaluate(collected.inventory);
    if (results === null) {
      summary.checksSkipped.push(check.title);
      continue;
    }
    summary.checksEvaluated++;

    if (results.length) {
      await prisma.checkResult.createMany({
        data: results.map(r => ({
          runId: run.id, checkId: check.id, provider, resourceId: r.resourceId, resourceName: r.resourceName,
          status: r.status, message: r.message, details: r.details as object | undefined,
        })),
      });
    }
    const failing = results.filter(r => r.status === 'fail');
    summary.passed += results.length - failing.length;
    summary.failed += failing.length;

    // Open (or refresh) one finding per failing resource.
    for (const r of failing) {
      const existing = await prisma.finding.findFirst({
        where: { checkId: check.id, resource: r.resourceId, isSample: sample, status: { in: ['Open', 'Accepted'] } },
        select: { id: true },
      });
      const data = {
        description: r.message,
        details: { resourceName: r.resourceName ?? r.resourceId, account: collected.account, ...(r.details ?? {}) },
      };
      if (existing) {
        await prisma.finding.update({ where: { id: existing.id }, data });
      } else {
        await prisma.finding.create({
          data: {
            ...data, title: check.title, severity: check.severity, resource: r.resourceId,
            remediation: check.remediation, checkId: check.id, provider, isSample: sample,
          },
        });
        summary.newFindings++;
      }
    }

    // Close findings whose resource now passes or no longer exists.
    const failingIds = new Set(failing.map(r => r.resourceId));
    const stale = await prisma.finding.findMany({
      where: { checkId: check.id, isSample: sample, status: { in: ['Open', 'Accepted'] } },
      select: { id: true, resource: true },
    });
    const toResolve = stale.filter(f => !f.resource || !failingIds.has(f.resource)).map(f => f.id);
    if (toResolve.length) {
      await prisma.finding.updateMany({ where: { id: { in: toResolve } }, data: { status: 'Resolved', resolvedAt: new Date() } });
      summary.resolvedFindings += toResolve.length;
    }

    // Every evaluation is kept as dated evidence for the mapped controls.
    const linked = Object.entries(check.controls).flatMap(([fw, ids]) =>
      (ids ?? []).map(id => controlIds.get(`${fw}:${id}`)).filter((x): x is string => !!x));
    const dataRecord = await appendEvidence({
      title: `${providerName(provider)}: ${check.title}`,
      description: `${results.length - failing.length} passing, ${failing.length} failing. ${check.description}`,
      kind: 'automated',
      source: `${provider}:${check.id}`,
      content: {
        check: check.id,
        title: check.title,
        provider,
        account: collected.account,
        collectedAt: new Date().toISOString(),
        summary: { resources: results.length, passing: results.length - failing.length, failing: failing.length },
        results: results.map(r => ({ resource: r.resourceName ?? r.resourceId, resourceId: r.resourceId, status: r.status, message: r.message })),
      },
      controlIds: linked,
      collectedBy: opts.actor,
      isSample: sample,
    });

    // Screenshot-style evidence image, when the result changed or one is due.
    try {
      const reason = await imageReason(provider, check.id, results, sample);
      if (reason) {
        const capturedAt = new Date();
        const png = await renderEvidenceCard({
          organization: organizationName(),
          provider: providerName(provider),
          account: collected.account,
          checkTitle: check.title,
          checkDescription: check.description,
          dataSource: CHECK_DATA_SOURCES[check.id] ?? `${providerName(provider)} API`,
          capturedAt,
          collectedBy: opts.actor,
          controls: controlLabels(check.controls),
          rows: results.map(r => ({ resource: r.resourceName ?? r.resourceId, status: r.status, message: r.message })),
          dataFingerprint: dataRecord.sha256 ?? '',
          runId: run.id,
          reason: reason.label,
          appVersion: APP_VERSION,
        });
        await appendEvidence({
          title: `${providerName(provider)}: ${check.title} (evidence image)`,
          description: `${reason.label}. Rendered from data record ${dataRecord.sha256?.slice(0, 16)}…`,
          kind: 'snapshot',
          source: `${provider}:${check.id}`,
          content: { check: check.id, provider, account: collected.account, resultsKey: reason.resultsKey, dataRecord: dataRecord.id, dataFingerprint: dataRecord.sha256, reason: reason.label },
          file: { name: `${check.id}_${capturedAt.toISOString().slice(0, 10)}.png`, mimeType: 'image/png', data: png },
          controlIds: linked,
          collectedBy: opts.actor,
          isSample: sample,
        });
        summary.imagesCreated++;
      }
    } catch (err) {
      summary.warnings.push(`Evidence image for "${check.title}" could not be created: ${describeError(err)}`);
    }
  }

  summary.ok = true;
  if (!sample) await anchorChain(opts.actor);
  await prisma.checkRun.update({
    where: { id: run.id },
    data: { status: collected.errors.length ? 'partial' : 'success', error: collected.errors.join('\n') || null, finishedAt: new Date() },
  });
  await recomputeAssessments();
  await logEvent({
    action: `${providerName(provider)} scan${sample ? ' (sample data)' : ''}`,
    actor: opts.actor,
    decision: collected.errors.length ? 'Partial' : 'Completed',
    resource: collected.account,
    reason: `${summary.checksEvaluated} checks: ${summary.passed} passing, ${summary.failed} failing resources. ${summary.newFindings} new, ${summary.resolvedFindings} resolved findings.` +
      (collected.errors.length ? ` Could not read: ${collected.errors.length} section(s).` : ''),
  });
  return summary;
}

const SAMPLE_DOCS: { title: string; fileName: string; controls: string[]; body: string }[] = [
  {
    title: 'Information Security Policy',
    fileName: 'information-security-policy.md',
    controls: ['SOC2:CC2.2', 'SOC2:CC5.3', 'SOC2:CC1.1', 'PCI:12.1.1'],
    body: '# Information Security Policy (sample)\n\nOwner: Head of Engineering\nApproved: this year\n\n1. Purpose\n2. Scope\n3. Roles and responsibilities\n4. Access control\n5. Incident reporting\n',
  },
  {
    title: 'Quarterly user access review',
    fileName: 'access-review-q3.csv',
    controls: ['SOC2:CC6.2', 'SOC2:CC6.3', 'PCI:7.2.4', 'CMMC:AC.L1-3.1.1'],
    body: 'system,user,role,reviewer,decision\nAWS,maria.lopez,admin,CTO,keep\nAWS,former.contractor,developer,CTO,remove\nGitHub,dev.chen,maintainer,CTO,keep\n',
  },
  {
    title: 'Incident Response Plan',
    fileName: 'incident-response-plan.md',
    controls: ['SOC2:CC7.3', 'SOC2:CC7.4', 'SOC2:CC7.5', 'PCI:12.10.1'],
    body: '# Incident Response Plan (sample)\n\n- Severity levels\n- On-call contacts\n- Containment, eradication, recovery\n- Customer notification within 72 hours\n- Post-incident review\n',
  },
];

/** Loads sample scans for all providers plus a few sample documents. */
export async function loadSampleData(actor: string) {
  await syncControls();
  await clearSampleData({ actor, quiet: true });
  const controlIds = await controlRowIds();
  const summaries = [];
  for (const p of PROVIDERS) summaries.push(await runScan(p.id, { actor, sample: true }));
  for (const doc of SAMPLE_DOCS) {
    await appendEvidence({
      title: doc.title,
      description: 'Sample document included with the sample data.',
      kind: 'upload',
      source: 'upload',
      file: { name: doc.fileName, mimeType: doc.fileName.endsWith('.csv') ? 'text/csv' : 'text/markdown', data: new TextEncoder().encode(doc.body) },
      controlIds: doc.controls.map(k => controlIds.get(k)).filter((x): x is string => !!x),
      collectedBy: actor,
      isSample: true,
    });
  }
  await recomputeAssessments();
  await logEvent({ action: 'Sample data loaded', actor, decision: 'Completed' });
  return summaries;
}

export async function clearSampleData(opts: { actor: string; quiet?: boolean }) {
  const [runs, findings, evidence] = await prisma.$transaction([
    prisma.checkRun.deleteMany({ where: { isSample: true } }),
    prisma.finding.deleteMany({ where: { isSample: true } }),
    prisma.evidenceArtifact.deleteMany({ where: { isSample: true } }),
  ]);
  const removed = runs.count + findings.count + evidence.count;
  if (removed > 0) {
    await recomputeAssessments();
    await logEvent({ action: 'Sample data cleared', actor: opts.actor, decision: 'Completed' });
  }
  return removed;
}

export async function hasSampleData() {
  return (await prisma.checkRun.count({ where: { isSample: true } })) > 0;
}
