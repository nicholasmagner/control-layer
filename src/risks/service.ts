import { HttpError } from '@/auth/session';
import { controlIdsForKeys, latestCheckOutcomes, recomputeAssessments } from '@/assessment/engine';
import { prisma } from '@/db/prisma';
import { getControlDef } from '@/frameworks';
import { csv } from '@/evidence/package';
import { anchorChain, appendEvidence } from '@/evidence/store';
import { logEvent } from '@/lib/events';
import { getSettings } from '@/lib/settings';
import { policyHtmlDocument } from '@/policies/markdown';
import { RISK_LIBRARY } from './library';
import { IMPACT, level, LIKELIHOOD, residualScore, riskSignals } from './score';

export const RISK_ASSESSMENT_CONTROLS = [
  'SOC2:CC3.1', 'SOC2:CC3.2', 'SOC2:CC3.3', 'SOC2:CC3.4', 'SOC2:CC9.1', 'SOC2:CC4.2', 'SOC2:CC5.1',
  'HIPAA:164.308(a)(1)(ii)(A)', 'HIPAA:164.308(a)(1)(ii)(B)', 'GDPR:Art. 32', 'ISO27001:5.7',
];
const AI_RISK_CONTROLS = ['ISO42001:A.5.2', 'ISO42001:A.5.3', 'NISTAIRMF:GOVERN 1', 'NISTAIRMF:MAP 1', 'NISTAIRMF:MEASURE 3', 'NISTAIRMF:MANAGE 1', 'NISTAIRMF:MANAGE 4'];
export const ASSESSMENT_EVERY_DAYS = 365;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export interface RiskView {
  id: string; title: string; description: string | null; category: string; owner: string | null;
  likelihood: number; impact: number; score: number; level: string;
  residualLikelihood: number | null; residualImpact: number | null; residualScore: number; residualLevel: string;
  treatment: string; treatmentPlan: string | null; status: string; controls: string[]; checks: string[]; libraryKey: string | null;
  acceptedBy: string | null; acceptedReason: string | null; acceptedUntil: string | null; dueDate: string | null; reviewedAt: string | null;
  createdBy: string; createdAt: string; failing: { checkId: string; title: string; failed: number }[];
  signals: { id: string; text: string; level: string }[];
}

export async function risksData() {
  const [rows, outcomes, settings, assessments, openFindings, vendors] = await Promise.all([
    prisma.risk.findMany({ orderBy: [{ createdAt: 'asc' }] }),
    latestCheckOutcomes(),
    getSettings(),
    prisma.riskAssessment.findMany({ orderBy: { completedAt: 'desc' }, take: 5 }),
    prisma.finding.count({ where: { status: 'Open' } }),
    prisma.vendor.findMany({ where: { status: 'active' }, select: { tier: true, usesAi: true } }),
  ]);
  const now = new Date();
  const risks: RiskView[] = rows.map(r => {
    const checks = (r.checks as string[]) ?? [];
    const failing = checks.map(id => outcomes.get(id)).filter((o): o is NonNullable<typeof o> => !!o && o.failed > 0).map(o => ({ checkId: o.checkId, title: o.title, failed: o.failed }));
    const score = r.likelihood * r.impact;
    const res = residualScore(r);
    return {
      id: r.id, title: r.title, description: r.description, category: r.category, owner: r.owner,
      likelihood: r.likelihood, impact: r.impact, score, level: level(score),
      residualLikelihood: r.residualLikelihood, residualImpact: r.residualImpact, residualScore: res, residualLevel: level(res),
      treatment: r.treatment, treatmentPlan: r.treatmentPlan, status: r.status, controls: (r.controls as string[]) ?? [], checks, libraryKey: r.libraryKey,
      acceptedBy: r.acceptedBy, acceptedReason: r.acceptedReason, acceptedUntil: iso(r.acceptedUntil), dueDate: iso(r.dueDate), reviewedAt: iso(r.reviewedAt),
      createdBy: r.createdBy, createdAt: r.createdAt.toISOString(), failing,
      signals: riskSignals({ ...r, failingChecks: failing.length }, now),
    };
  });

  // Library entries that apply to this company, with why they're suggested.
  const have = new Set(rows.map(r => r.libraryKey).filter(Boolean));
  const library = RISK_LIBRARY.filter(l => !l.frameworks || l.frameworks.some(f => settings.frameworks.includes(f))).map(l => {
    const failing = l.checks.map(id => outcomes.get(id)).filter((o): o is NonNullable<typeof o> => !!o && o.failed > 0);
    const reasons = [
      failing.length ? `${failing.length} failing check${failing.length === 1 ? '' : 's'}` : null,
      l.key === 'vendor_breach' && vendors.some(v => v.tier === 'critical' || v.tier === 'high') ? 'you have high-risk vendors' : null,
      (l.key === 'ai_vendor_training' || l.key === 'ai_data_leakage') && vendors.some(v => v.usesAi) ? 'you use AI vendors' : null,
      l.category === 'AI' && settings.frameworks.some(f => f === 'ISO42001' || f === 'NISTAIRMF') && l.key !== 'ai_vendor_training' ? 'you follow an AI framework' : null,
    ].filter((x): x is string => !!x);
    return { key: l.key, title: l.title, category: l.category, description: l.description, likelihood: l.likelihood, impact: l.impact, added: have.has(l.key), reasons };
  });

  const last = assessments[0];
  return {
    risks,
    library,
    openFindings,
    lastAssessment: last ? { completedAt: last.completedAt.toISOString(), completedBy: last.completedBy } : null,
    nextAssessmentDue: last ? new Date(last.completedAt.getTime() + ASSESSMENT_EVERY_DAYS * 86_400_000).toISOString() : null,
  };
}

const clamp = (n: unknown) => {
  const v = Number(n);
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
};

/** Validates fields for create / update. */
export function riskData(body: Record<string, unknown>) {
  const d: Record<string, unknown> = {};
  const text = (k: string, max: number) => {
    if (!(k in body)) return;
    const v = typeof body[k] === 'string' ? (body[k] as string).trim().slice(0, max) : '';
    d[k] = v || null;
  };
  text('title', 200); text('description', 5000); text('owner', 200); text('treatmentPlan', 5000); text('category', 40);
  if ('title' in body && !d.title) throw new HttpError(400, 'Give the risk a title.');
  if ('category' in body && !d.category) d.category = 'Security';
  for (const k of ['likelihood', 'impact'] as const) if (k in body) { const v = clamp(body[k]); if (!v) throw new HttpError(400, `${k} must be 1 to 5.`); d[k] = v; }
  for (const k of ['residualLikelihood', 'residualImpact'] as const) if (k in body) d[k] = body[k] === null || body[k] === '' ? null : clamp(body[k]);
  if ('treatment' in body) {
    if (!['mitigate', 'accept', 'transfer', 'avoid'].includes(String(body.treatment))) throw new HttpError(400, 'Unknown treatment.');
    d.treatment = body.treatment;
  }
  if ('status' in body) {
    if (!['open', 'treating', 'closed'].includes(String(body.status))) throw new HttpError(400, 'Use the accept action to accept a risk.');
    d.status = body.status;
  }
  if ('controls' in body) {
    if (!Array.isArray(body.controls)) throw new HttpError(400, 'Invalid controls.');
    const keys = [...new Set(body.controls.map(String))].slice(0, 50);
    for (const k of keys) { const i = k.indexOf(':'); if (!getControlDef(k.slice(0, i), k.slice(i + 1))) throw new HttpError(400, `Unknown control "${k}".`); }
    d.controls = keys;
  }
  if ('dueDate' in body) d.dueDate = typeof body.dueDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate) ? new Date(`${body.dueDate}T00:00:00Z`) : null;
  return d;
}

export async function addFromLibrary(keys: string[], actor: string) {
  const existing = new Set((await prisma.risk.findMany({ select: { libraryKey: true } })).map(r => r.libraryKey));
  let added = 0;
  for (const key of keys) {
    const l = RISK_LIBRARY.find(x => x.key === key);
    if (!l) throw new HttpError(400, `Unknown risk "${key}".`);
    if (existing.has(key)) continue;
    await prisma.risk.create({
      data: {
        title: l.title, description: l.description, category: l.category, likelihood: l.likelihood, impact: l.impact,
        treatment: 'mitigate', treatmentPlan: l.plan, controls: l.controls, checks: l.checks, libraryKey: l.key, owner: actor, createdBy: actor,
      },
    });
    added++;
  }
  if (added) await logEvent({ action: 'Risks added', actor, decision: 'Completed', resource: `${added} risk${added === 1 ? '' : 's'}`, reason: 'From the risk library' });
  return added;
}

/** Formally accepts a risk: who, why, and until when. */
export async function acceptRisk(id: string, reason: string, until: Date, actor: string) {
  if (reason.trim().length < 10) throw new HttpError(400, 'Explain why the risk is accepted (at least a sentence).');
  if (until.getTime() > Date.now() + 366 * 86_400_000) throw new HttpError(400, 'Accept a risk for at most a year, then review it again.');
  const r = await prisma.risk.update({ where: { id }, data: { status: 'accepted', treatment: 'accept', acceptedBy: actor, acceptedReason: reason.trim(), acceptedUntil: until, reviewedAt: new Date() } })
    .catch(() => { throw new HttpError(404, 'Risk not found.'); });
  await logEvent({ action: 'Risk accepted', actor, decision: 'Completed', resource: r.title, reason: `Until ${until.toISOString().slice(0, 10)}: ${reason.slice(0, 300)}` });
}

/** Completes the periodic risk assessment: every risk marked reviewed, and the register saved as evidence. */
export async function completeAssessment(actor: string, statusByKey: Map<string, string>) {
  const { risks } = await risksData();
  const active = risks.filter(r => r.status !== 'closed');
  if (!active.length) throw new HttpError(400, 'Add risks to the register first.');
  const unowned = active.filter(r => !r.owner).length;
  if (unowned) throw new HttpError(400, `${unowned} risk${unowned === 1 ? ' has' : 's have'} no owner. Assign owners before completing the assessment.`);
  const settings = await getSettings();
  const now = new Date();
  const cell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');
  const heat = [5, 4, 3, 2, 1].map(l => `| **${LIKELIHOOD[l]}** | ${[1, 2, 3, 4, 5].map(i => active.filter(r => (r.residualLikelihood ?? r.likelihood) === l && (r.residualImpact ?? r.impact) === i).length || '').join(' | ')} |`).join('\n');
  const ctl = (keys: string[]) => {
    const met = keys.filter(k => statusByKey.get(k) === 'Met').length;
    return keys.length ? `${met}/${keys.length} met` : '';
  };
  const md = `# Risk assessment

| | |
| :--- | :--- |
| Organization | ${settings.organizationName} |
| Completed | ${now.toISOString().slice(0, 10)} by ${actor} |
| Risks assessed | ${active.length} |
| Critical / high (residual) | ${active.filter(r => r.residualLevel === 'critical' || r.residualLevel === 'high').length} |
| Accepted | ${active.filter(r => r.status === 'accepted').length} |
| Method | Likelihood (1-5) x impact (1-5); inherent before controls, residual after |

## Residual risk heat map
| Likelihood \\ Impact | ${[1, 2, 3, 4, 5].map(i => IMPACT[i]).join(' | ')} |
| :--- | :---: | :---: | :---: | :---: | :---: |
${heat}

## Risk register
| Risk | Category | Owner | Inherent | Residual | Treatment | Controls | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${active.sort((a, b) => b.residualScore - a.residualScore).map(r => `| ${cell(r.title)} | ${r.category} | ${cell(r.owner ?? '')} | ${r.score} (${r.level}) | ${r.residualScore} (${r.residualLevel}) | ${r.treatment} | ${ctl(r.controls)} | ${r.status}${r.status === 'accepted' && r.acceptedUntil ? ` until ${r.acceptedUntil.slice(0, 10)}` : ''} |`).join('\n')}

## Treatment plans
${active.filter(r => r.treatmentPlan).map(r => `- **${cell(r.title)}**: ${cell(r.treatmentPlan!)}`).join('\n') || '- None'}

## Accepted risks
${active.filter(r => r.status === 'accepted').map(r => `- **${cell(r.title)}**: accepted by ${r.acceptedBy} until ${r.acceptedUntil?.slice(0, 10)}. ${cell(r.acceptedReason ?? '')}`).join('\n') || '- None'}
`;
  const html = policyHtmlDocument('Risk assessment', md, `${settings.organizationName} · risk assessment completed in ControlLayer by ${actor} on ${now.toISOString()}`);
  const keys = [...RISK_ASSESSMENT_CONTROLS, ...(active.some(r => r.category === 'AI') ? AI_RISK_CONTROLS : [])];
  const evidence = await appendEvidence({
    title: `Risk assessment ${now.toISOString().slice(0, 10)} (${active.length} risks)`,
    description: `Risk register reviewed by ${actor}.`,
    kind: 'upload', source: 'risks:assessment',
    file: { name: `risk-assessment-${now.toISOString().slice(0, 10)}.html`, mimeType: 'text/html', data: new TextEncoder().encode(html) },
    controlIds: await controlIdsForKeys(keys), collectedBy: actor,
  });
  await appendEvidence({
    title: `Risk register ${now.toISOString().slice(0, 10)} (CSV)`, kind: 'upload', source: 'risks:assessment',
    file: {
      name: `risk-register-${now.toISOString().slice(0, 10)}.csv`, mimeType: 'text/csv',
      data: new TextEncoder().encode(csv([
        ['Risk', 'Category', 'Owner', 'Likelihood', 'Impact', 'Inherent score', 'Residual likelihood', 'Residual impact', 'Residual score', 'Treatment', 'Plan', 'Status', 'Accepted until', 'Controls'],
        ...active.map(r => [r.title, r.category, r.owner, r.likelihood, r.impact, r.score, r.residualLikelihood ?? r.likelihood, r.residualImpact ?? r.impact, r.residualScore, r.treatment, r.treatmentPlan, r.status, r.acceptedUntil?.slice(0, 10), r.controls.join('; ')]),
      ])),
    },
    controlIds: await controlIdsForKeys(keys), collectedBy: actor,
  });
  await prisma.risk.updateMany({ where: { status: { not: 'closed' } }, data: { reviewedAt: now } });
  await prisma.riskAssessment.create({ data: { completedBy: actor, completedAt: now, evidenceId: evidence.id, summary: { risks: active.length } } });
  await recomputeAssessments();
  void anchorChain(actor).catch(err => console.error('[timestamp]', err));
  await logEvent({ action: 'Risk assessment completed', actor, decision: 'Completed', resource: `${active.length} risks` });
}
