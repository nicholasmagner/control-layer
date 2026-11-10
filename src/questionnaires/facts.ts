import { latestCheckOutcomes } from '@/assessment/engine';
import { readinessScore, type ControlStatus } from '@/assessment/status';
import type { Provider } from '@/checks/types';
import { connectorInfo } from '@/connectors';
import { prisma } from '@/db/prisma';
import { FRAMEWORKS } from '@/frameworks';
import { getSettings } from '@/lib/settings';
import { loadTrustConfig } from '@/trust/config';

/**
 * Everything the built-in answers know about the company, read once per
 * answering run. Answers are generated from this, so they stay true as the
 * company's setup changes.
 */
export interface CheckState {
  state: 'pass' | 'fail' | 'unknown';
  passed: number;
  failed: number;
  /** Titles of failing checks, for the reviewer. */
  failing: string[];
}

export interface Facts {
  org: string;
  sample: boolean;
  lastScan: Date | null;
  connected: Set<Provider>;
  awsRegions: string[];
  policies: Map<string, { title: string; version: number; publishedAt: Date; owner: string | null }>;
  people: { active: number; acceptedPct: number | null };
  frameworks: { id: string; name: string; score: number; status: string | null }[];
  trust: { enabled: boolean; documents: string[] };
  devices: { total: number; servers: number; workstations: number };
  vendors: { total: number; reviewedPct: number | null; critical: number };
  risks: { open: number; lastAssessed: Date | null };
  accessReviews: { lastCompleted: Date | null; count: number };
  timestamps: boolean;
  check: (ids: string[]) => CheckState;
}

async function optional<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback; // table not present yet / feature unused
  }
}

export async function loadFacts(): Promise<Facts> {
  const [settings, outcomes, connectors, policies, people, trust, trustDocs, devices, sampleRuns, lastRun, controls] = await Promise.all([
    getSettings(),
    latestCheckOutcomes(),
    connectorInfo(),
    prisma.policy.findMany({ include: { versions: { orderBy: { version: 'desc' }, take: 1, include: { acknowledgments: { select: { personId: true } } } } } }),
    prisma.person.findMany({ where: { OR: [{ endDate: null }, { endDate: { gt: new Date() } }] }, select: { id: true } }),
    loadTrustConfig(),
    prisma.trustDocument.findMany({ select: { title: true } }),
    prisma.device.groupBy({ by: ['role'], _count: true }),
    prisma.checkRun.count({ where: { isSample: true } }),
    prisma.checkRun.findFirst({ where: { status: { in: ['success', 'partial'] } }, orderBy: { startedAt: 'desc' }, select: { startedAt: true } }),
    prisma.control.findMany({ include: { scores: { orderBy: { evaluatedAt: 'desc' }, take: 1 } } }),
  ]);

  const published = policies.filter(p => p.versions[0]);
  const signoff = published.filter(p => p.requiresSignoff);
  const activeIds = new Set(people.map(p => p.id));
  const needed = signoff.length * activeIds.size;
  const done = signoff.reduce((n, p) => n + p.versions[0].acknowledgments.filter(a => activeIds.has(a.personId)).length, 0);

  const vendors = await optional(async () => {
    const rows = await prisma.vendor.findMany({ where: { status: 'active' }, select: { tier: true, lastReviewedAt: true, status: true } });
    const reviewed = rows.filter(v => v.lastReviewedAt && Date.now() - v.lastReviewedAt.getTime() < 400 * 86_400_000).length;
    return { total: rows.length, reviewedPct: rows.length ? Math.round((reviewed / rows.length) * 100) : null, critical: rows.filter(v => v.tier === 'critical' || v.tier === 'high').length };
  }, { total: 0, reviewedPct: null, critical: 0 });
  const risks = await optional(async () => {
    const r = prisma as unknown as { risk: { count: (a: unknown) => Promise<number>; findFirst: (a: unknown) => Promise<{ reviewedAt: Date | null } | null> } };
    const open = await r.risk.count({ where: { status: { not: 'closed' } } });
    const last = await r.risk.findFirst({ where: { reviewedAt: { not: null } }, orderBy: { reviewedAt: 'desc' }, select: { reviewedAt: true } });
    return { open, lastAssessed: last?.reviewedAt ?? null };
  }, { open: 0, lastAssessed: null });
  const accessReviews = await optional(async () => {
    const a = prisma as unknown as { accessReview: { findMany: (a: unknown) => Promise<{ completedAt: Date | null }[]> } };
    const done = await a.accessReview.findMany({ where: { status: 'completed' }, orderBy: { completedAt: 'desc' }, select: { completedAt: true } });
    return { lastCompleted: done[0]?.completedAt ?? null, count: done.length };
  }, { lastCompleted: null, count: 0 });

  const statusByFw = new Map<string, string[]>();
  for (const c of controls) {
    const s = !c.applicable ? 'Not Applicable' : (c.scores[0]?.status ?? 'Needs Evidence');
    statusByFw.set(c.framework, [...(statusByFw.get(c.framework) ?? []), s]);
  }

  const aws = connectors.find(c => c.provider === 'aws');
  return {
    org: settings.organizationName,
    sample: sampleRuns > 0,
    lastScan: lastRun?.startedAt ?? null,
    connected: new Set(connectors.filter(c => c.configured).map(c => c.provider)),
    awsRegions: aws?.configured ? aws.target.replace(/^Regions:\s*/, '').split(',').map(s => s.trim()).filter(Boolean) : [],
    policies: new Map(published.map(p => [p.slug, { title: p.title, version: p.versions[0].version, publishedAt: p.versions[0].publishedAt, owner: p.owner }])),
    people: { active: activeIds.size, acceptedPct: needed ? Math.round((done / needed) * 100) : null },
    frameworks: FRAMEWORKS.filter(f => settings.frameworks.includes(f.id)).map(f => ({
      id: f.id, name: f.name, score: readinessScore((statusByFw.get(f.id) ?? []) as ControlStatus[]),
      status: trust.frameworks.find(t => t.id === f.id)?.status || null,
    })),
    trust: { enabled: trust.enabled, documents: trustDocs.map(d => d.title) },
    devices: {
      total: devices.reduce((n, d) => n + d._count, 0),
      servers: devices.find(d => d.role === 'server')?._count ?? 0,
      workstations: devices.find(d => d.role === 'workstation')?._count ?? 0,
    },
    vendors, risks, accessReviews,
    timestamps: settings.timestampAuthorityUrl !== null,
    check: (ids: string[]) => {
      const ran = ids.map(id => outcomes.get(id)).filter((o): o is NonNullable<typeof o> => !!o && o.passed + o.failed > 0);
      const passed = ran.reduce((n, o) => n + o.passed, 0);
      const failed = ran.reduce((n, o) => n + o.failed, 0);
      return { state: !ran.length ? 'unknown' : failed ? 'fail' : 'pass', passed, failed, failing: ran.filter(o => o.failed).map(o => o.title) };
    },
  };
}
