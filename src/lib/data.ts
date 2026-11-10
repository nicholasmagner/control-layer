import { latestCheckOutcomes } from '@/assessment/engine';
import { readinessScore, type ControlStatus } from '@/assessment/status';
import { can, type CurrentUser } from '@/auth/session';
import { ALL_CHECKS } from '@/checks';
import { connectorInfo, type ConnectorInfo } from '@/connectors';
import { isLocalInstall } from '@/connectors/config';
import { secretsAvailable } from '@/lib/secrets';
import { prisma } from '@/db/prisma';
import { DEFAULT_FRESHNESS_DAYS, FRAMEWORKS, type FrameworkId } from '@/frameworks';
import { settingsView, type SettingsView } from '@/lib/settings';
import { policiesData, type PoliciesData } from '@/policies/service';

/** Everything the app screens render, already serializable. */

export interface ControlView {
  id: string;
  framework: FrameworkId;
  controlId: string;
  title: string;
  description: string;
  category: string;
  applicable: boolean;
  naReason: string | null;
  owner: string | null;
  status: ControlStatus | 'Not assessed';
  justification: string;
  evaluatedAt: string | null;
  expectedEvidence: string[];
  freshnessDays: number;
  checks: { id: string; title: string; provider: string; severity: string; passed: number; failed: number; run: boolean }[];
  evidence: { id: string; title: string; kind: string; mimeType: string | null; collectedAt: string }[];
  evidenceCount: number;
}

export interface FrameworkView {
  id: FrameworkId;
  name: string;
  shortName: string;
  version: string;
  description: string;
  coverage: 'full' | 'preview';
  score: number;
  counts: Record<string, number>;
  controls: ControlView[];
}

export interface FindingView {
  id: string;
  title: string;
  description: string;
  severity: string;
  status: string;
  resource: string | null;
  resourceName: string | null;
  remediation: string | null;
  provider: string | null;
  checkId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  acceptedBy: string | null;
  acceptReason: string | null;
  mitigation: string | null;
  isSample: boolean;
  controls: string[];
}

export interface EvidenceView {
  id: string;
  seq: number;
  title: string;
  description: string | null;
  kind: string;
  source: string;
  collectedAt: string;
  collectedBy: string | null;
  fileName: string | null;
  fileSize: number | null;
  mimeType: string | null;
  sha256: string | null;
  isSample: boolean;
  controls: { framework: string; controlId: string }[];
}

export interface AppData {
  user: CurrentUser;
  organization: string;
  frameworks: FrameworkView[];
  findings: FindingView[];
  evidence: EvidenceView[];
  evidenceTotal: number;
  events: { id: string; action: string; actor: string; decision: string; resource: string | null; reason: string | null; timestamp: string }[];
  connectors: (ConnectorInfo & {
    lastRun: { status: string; startedAt: string; finishedAt: string | null; error: string | null; isSample: boolean } | null;
    checkCount: number;
  })[];
  users: { id: string; name: string; email: string; role: string; lastLoginAt: string | null; createdAt: string }[];
  features: { assistant: boolean; remediation: boolean; hasSampleData: boolean; scanIntervalHours: number | null; snapshotIntervalDays: number; localInstall: boolean; canStoreKeys: boolean };
  timestamps: { enabled: boolean; authority: string | null; count: number; latest: { genTime: string; seq: number } | null };
  settings: SettingsView;
  policies: PoliciesData;
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function getAppData(user: CurrentUser): Promise<AppData> {
  const settings = await settingsView();
  const policies = await policiesData();
  const [controls, outcomes, findings, evidence, evidenceTotal, events, runs, users, sampleRuns, anchorCount, latestAnchor] = await Promise.all([
    prisma.control.findMany({
      include: {
        scores: { orderBy: { evaluatedAt: 'desc' }, take: 1 },
        evidence: { orderBy: { evidence: { collectedAt: 'desc' } }, take: 8, include: { evidence: { select: { id: true, title: true, kind: true, mimeType: true, collectedAt: true } } } },
        _count: { select: { evidence: true } },
      },
    }),
    latestCheckOutcomes(),
    prisma.finding.findMany({ orderBy: [{ createdAt: 'desc' }], take: 500 }),
    prisma.evidenceArtifact.findMany({
      orderBy: { seq: 'desc' }, take: 300,
      select: {
        id: true, seq: true, title: true, description: true, kind: true, source: true, collectedAt: true, collectedBy: true,
        fileName: true, fileSize: true, mimeType: true, sha256: true, isSample: true,
        controls: { select: { control: { select: { framework: true, controlId: true } } } },
      },
    }),
    prisma.evidenceArtifact.count(),
    prisma.eventLog.findMany({ orderBy: { timestamp: 'desc' }, take: 150 }),
    prisma.checkRun.findMany({ orderBy: { startedAt: 'desc' }, take: 30 }),
    can.admin(user) ? prisma.user.findMany({ orderBy: { createdAt: 'asc' } }) : Promise.resolve([]),
    prisma.checkRun.count({ where: { isSample: true } }),
    prisma.chainAnchor.count(),
    prisma.chainAnchor.findFirst({ orderBy: { seq: 'desc' }, select: { genTime: true, seq: true } }),
  ]);

  const byKey = new Map(controls.map(c => [`${c.framework}:${c.controlId}`, c]));

  const frameworks: FrameworkView[] = FRAMEWORKS.map(fw => {
    const views: ControlView[] = fw.controls.map(def => {
      const row = byKey.get(`${fw.id}:${def.id}`);
      const score = row?.scores[0];
      const checks = ALL_CHECKS.filter(c => c.controls[fw.id]?.includes(def.id)).map(c => {
        const o = outcomes.get(c.id);
        return { id: c.id, title: c.title, provider: c.provider, severity: c.severity, passed: o?.passed ?? 0, failed: o?.failed ?? 0, run: !!o };
      });
      return {
        id: row?.id ?? '',
        framework: fw.id,
        controlId: def.id,
        title: def.title,
        description: def.description,
        category: def.category,
        applicable: row?.applicable ?? true,
        naReason: row?.naReason ?? null,
        owner: row?.owner ?? null,
        status: (row && !row.applicable ? 'Not Applicable' : (score?.status as ControlStatus | undefined)) ?? 'Not assessed',
        justification: (row && !row.applicable ? row.naReason : score?.justification) ?? 'Not assessed yet. Run a scan or upload evidence.',
        evaluatedAt: iso(score?.evaluatedAt),
        expectedEvidence: def.evidence,
        freshnessDays: def.freshnessDays ?? DEFAULT_FRESHNESS_DAYS,
        checks,
        evidence: (row?.evidence ?? []).map(l => ({ ...l.evidence, collectedAt: l.evidence.collectedAt.toISOString() })),
        evidenceCount: row?._count.evidence ?? 0,
      };
    });
    const statuses = views.map(v => (v.status === 'Not assessed' ? 'Needs Evidence' : v.status));
    const counts = statuses.reduce<Record<string, number>>((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {});
    return {
      id: fw.id, name: fw.name, shortName: fw.shortName, version: fw.version, description: fw.description, coverage: fw.coverage,
      score: readinessScore(statuses), counts, controls: views,
    };
  });

  const checkControls = new Map(ALL_CHECKS.map(c => [c.id, Object.entries(c.controls).flatMap(([fw, ids]) =>
    (ids ?? []).map(id => `${FRAMEWORKS.find(f => f.id === fw)?.shortName ?? fw} ${id}`))]));

  return {
    user,
    organization: settings.organizationName,
    frameworks,
    findings: findings.map(f => {
      const details = (f.details ?? {}) as { resourceName?: string; mitigation?: string };
      return {
        id: f.id, title: f.title, description: f.description, severity: f.severity, status: f.status,
        resource: f.resource, resourceName: details.resourceName ?? f.resource, remediation: f.remediation,
        provider: f.provider, checkId: f.checkId, createdAt: f.createdAt.toISOString(), resolvedAt: iso(f.resolvedAt),
        acceptedBy: f.acceptedBy, acceptReason: f.acceptReason, mitigation: details.mitigation ?? null, isSample: f.isSample,
        controls: (f.checkId && checkControls.get(f.checkId)) || [],
      };
    }),
    evidence: evidence.map(e => ({
      ...e, collectedAt: e.collectedAt.toISOString(),
      controls: e.controls.map(c => c.control),
    })),
    evidenceTotal,
    events: events.map(e => ({ id: e.id, action: e.action, actor: e.actor, decision: e.decision, resource: e.resource, reason: e.reason, timestamp: e.timestamp.toISOString() })),
    connectors: (await connectorInfo()).map(c => {
      const last = runs.find(r => r.provider === c.provider);
      return {
        ...c,
        lastRun: last ? { status: last.status, startedAt: last.startedAt.toISOString(), finishedAt: iso(last.finishedAt), error: last.error, isSample: last.isSample } : null,
        checkCount: ALL_CHECKS.filter(x => x.provider === c.provider).length,
      };
    }),
    users: users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role, lastLoginAt: iso(u.lastLoginAt), createdAt: u.createdAt.toISOString() })),
    features: { assistant: settings.assistant.configured, remediation: settings.remediationEnabled, hasSampleData: sampleRuns > 0, scanIntervalHours: settings.scanIntervalHours, snapshotIntervalDays: settings.snapshotIntervalDays, localInstall: isLocalInstall(), canStoreKeys: secretsAvailable() },
    timestamps: {
      enabled: settings.timestampsEnabled, authority: settings.timestampsEnabled ? new URL(settings.timestampAuthorityUrl).host : null, count: anchorCount,
      latest: latestAnchor ? { genTime: latestAnchor.genTime.toISOString(), seq: latestAnchor.seq } : null,
    },
    settings,
    policies,
  };
}
