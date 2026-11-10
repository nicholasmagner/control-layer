import { createHash, randomBytes } from 'node:crypto';
import { HttpError } from '@/auth/session';
import { controlIdsForKeys, recomputeAssessments } from '@/assessment/engine';
import { connectorInfo } from '@/connectors';
import { prisma } from '@/db/prisma';
import { csv } from '@/evidence/package';
import { anchorChain, appendEvidence } from '@/evidence/store';
import { logEvent } from '@/lib/events';
import { getSettings } from '@/lib/settings';
import { policyHtmlDocument } from '@/policies/markdown';
import { DATA_TYPES, VENDOR_CATALOG } from './catalog';
import { computeTier, nextReviewDue, scoreVendorAnswers, vendorSignals, VENDOR_QUESTIONS, type Signal, type VendorAnswer } from './risk';

export const VENDOR_CONTROLS = ['SOC2:CC9.2', 'GDPR:Art. 28', 'GDPR:Art. 30', 'GDPR:Art. 44-49'];
const AI_VENDOR_CONTROLS = ['ISO42001:A.10.2', 'ISO42001:A.10.3', 'ISO42001:A.4.4', 'NISTAIRMF:GOVERN 6', 'NISTAIRMF:MANAGE 3', 'NISTAIRMF:MAP 4'];

export const hashVendorToken = (t: string) => createHash('sha256').update(t).digest('hex');

export interface VendorView {
  id: string; name: string; website: string | null; category: string; description: string | null; owner: string | null; status: string;
  dataAccess: string[]; businessCritical: boolean; usesAi: boolean; aiTrainsOnData: boolean | null; subprocessor: boolean; dataLocation: string | null;
  tier: string; tierOverride: string | null; dpaSigned: boolean; baaSigned: boolean; contractEnd: string | null; trustUrl: string | null; notes: string | null;
  lastReviewedAt: string | null; nextReviewDue: string | null; createdAt: string;
  signals: Signal[];
  documents: { id: string; kind: string; title: string; fileName: string; fileSize: number; validUntil: string | null; uploadedBy: string; createdAt: string }[];
  reviews: { id: string; reviewer: string; outcome: string; residualRisk: string; notes: string | null; checklist: Record<string, boolean>; reviewedAt: string; evidenceId: string | null }[];
  questionnaires: { id: string; sentTo: string; status: string; score: number | null; respondent: string | null; sentAt: string; completedAt: string | null; expiresAt: string; answers: Record<string, VendorAnswer> | null }[];
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function vendorsData() {
  const [rows, settings, connectors] = await Promise.all([
    prisma.vendor.findMany({
      orderBy: { name: 'asc' },
      include: {
        documents: { orderBy: { createdAt: 'desc' }, select: { id: true, kind: true, title: true, fileName: true, fileSize: true, validUntil: true, uploadedBy: true, createdAt: true } },
        reviews: { orderBy: { reviewedAt: 'desc' }, take: 10 },
        questionnaires: { orderBy: { sentAt: 'desc' }, take: 5 },
      },
    }),
    getSettings(),
    connectorInfo(),
  ]);
  const now = new Date();
  const hipaa = settings.frameworks.includes('HIPAA');
  const vendors: VendorView[] = rows.map(r => {
    const facts = {
      ...r, dataAccess: (r.dataAccess as string[]) ?? [], documents: r.documents,
      questionnaireCompletedAt: r.questionnaires.find(q => q.status === 'completed')?.completedAt ?? null,
    };
    const tier = computeTier(facts);
    return {
      id: r.id, name: r.name, website: r.website, category: r.category, description: r.description, owner: r.owner, status: r.status,
      dataAccess: facts.dataAccess, businessCritical: r.businessCritical, usesAi: r.usesAi, aiTrainsOnData: r.aiTrainsOnData, subprocessor: r.subprocessor,
      dataLocation: r.dataLocation, tier, tierOverride: r.tierOverride, dpaSigned: r.dpaSigned, baaSigned: r.baaSigned, contractEnd: iso(r.contractEnd),
      trustUrl: r.trustUrl, notes: r.notes, lastReviewedAt: iso(r.lastReviewedAt), nextReviewDue: r.status === 'active' ? iso(nextReviewDue(tier, r.lastReviewedAt, r.createdAt)) : null,
      createdAt: r.createdAt.toISOString(),
      signals: vendorSignals(facts, { now, hipaa, createdAt: r.createdAt }),
      documents: r.documents.map(d => ({ ...d, validUntil: iso(d.validUntil), createdAt: d.createdAt.toISOString() })),
      reviews: r.reviews.map(x => ({ id: x.id, reviewer: x.reviewer, outcome: x.outcome, residualRisk: x.residualRisk, notes: x.notes, checklist: x.checklist as Record<string, boolean>, reviewedAt: x.reviewedAt.toISOString(), evidenceId: x.evidenceId })),
      questionnaires: r.questionnaires.map(q => ({
        id: q.id, sentTo: q.sentTo, status: q.status, score: q.score, respondent: q.respondent, sentAt: q.sentAt.toISOString(),
        completedAt: iso(q.completedAt), expiresAt: q.expiresAt.toISOString(), answers: q.answers as Record<string, VendorAnswer> | null,
      })),
    };
  });
  const have = new Set(rows.map(r => r.name.toLowerCase()));
  const connected = new Set(connectors.filter(c => c.configured).map(c => c.provider as string));
  const suggestions = VENDOR_CATALOG.filter(c => c.provider && connected.has(c.provider) && !have.has(c.name.toLowerCase())).map(c => c.name);
  return { vendors, suggestions };
}

export interface VendorInput {
  name: string; website?: string | null; category?: string; description?: string | null; owner?: string | null; status?: string;
  dataAccess?: string[]; businessCritical?: boolean; usesAi?: boolean; aiTrainsOnData?: boolean | null; subprocessor?: boolean; dataLocation?: string | null;
  tierOverride?: string | null; dpaSigned?: boolean; baaSigned?: boolean; contractEnd?: Date | null; trustUrl?: string | null; notes?: string | null;
}

const DATA_IDS = new Set(DATA_TYPES.map(d => d.id));

/** Normalizes input and stores the computed tier alongside it. */
export function vendorData(input: Partial<VendorInput>, existing?: { dataAccess: string[]; businessCritical: boolean; usesAi: boolean; tierOverride: string | null }) {
  const data: Record<string, unknown> = {};
  for (const k of ['name', 'website', 'category', 'description', 'owner', 'dataLocation', 'trustUrl', 'notes'] as const) {
    if (k in input) data[k] = typeof input[k] === 'string' ? (input[k] as string).trim().slice(0, k === 'notes' || k === 'description' ? 5000 : 300) || null : null;
  }
  if ('name' in input && !data.name) throw new HttpError(400, 'Give the vendor a name.');
  if ('category' in input) data.category = data.category ?? 'Other';
  if ('status' in input) data.status = input.status === 'offboarded' ? 'offboarded' : 'active';
  if ('dataAccess' in input) data.dataAccess = [...new Set((input.dataAccess ?? []).filter(d => DATA_IDS.has(d)))];
  for (const k of ['businessCritical', 'usesAi', 'subprocessor', 'dpaSigned', 'baaSigned'] as const) if (k in input) data[k] = input[k] === true;
  if ('aiTrainsOnData' in input) data.aiTrainsOnData = input.aiTrainsOnData === true ? true : input.aiTrainsOnData === false ? false : null;
  if ('tierOverride' in input) data.tierOverride = ['critical', 'high', 'medium', 'low'].includes(String(input.tierOverride)) ? input.tierOverride : null;
  if ('contractEnd' in input) data.contractEnd = input.contractEnd ?? null;
  const merged = {
    dataAccess: (data.dataAccess as string[] | undefined) ?? existing?.dataAccess ?? [],
    businessCritical: (data.businessCritical as boolean | undefined) ?? existing?.businessCritical ?? false,
    usesAi: (data.usesAi as boolean | undefined) ?? existing?.usesAi ?? false,
    tierOverride: 'tierOverride' in data ? (data.tierOverride as string | null) : existing?.tierOverride ?? null,
  };
  data.tier = computeTier(merged);
  return data;
}

export const REVIEW_CHECKLIST: { id: string; label: string }[] = [
  { id: 'report_reviewed', label: 'Reviewed their SOC 2 / ISO 27001 report or security questionnaire' },
  { id: 'exceptions_ok', label: 'Exceptions and complementary user entity controls (CUECs) in the report are addressed' },
  { id: 'contract_terms', label: 'Contract includes confidentiality, security and breach notification terms' },
  { id: 'dpa', label: 'Data processing agreement in place (or not needed)' },
  { id: 'access_limited', label: 'Their access to our data and systems is limited to what they need' },
  { id: 'ai_terms', label: 'AI use is understood, and they may not train on our data without consent (or not applicable)' },
];

/** Records a review and saves it as evidence for vendor management controls. */
export async function recordReview(vendorId: string, input: { outcome: string; residualRisk: string; notes: string; checklist: Record<string, boolean> }, actor: string) {
  const v = await prisma.vendor.findUnique({ where: { id: vendorId }, include: { documents: { select: { kind: true, title: true, validUntil: true } } } });
  if (!v) throw new HttpError(404, 'Vendor not found.');
  if (!['approved', 'approved_with_conditions', 'rejected'].includes(input.outcome)) throw new HttpError(400, 'Choose an outcome.');
  if (!['low', 'medium', 'high'].includes(input.residualRisk)) throw new HttpError(400, 'Choose the residual risk.');
  const settings = await getSettings();
  const now = new Date();
  const outcome = ({ approved: 'Approved', approved_with_conditions: 'Approved with conditions', rejected: 'Rejected' } as Record<string, string>)[input.outcome] ?? input.outcome;
  const data = (v.dataAccess as string[]).map(d => DATA_TYPES.find(t => t.id === d)?.label ?? d);
  const md = `# Vendor security review: ${v.name}

| | |
| :--- | :--- |
| Organization | ${settings.organizationName} |
| Vendor | ${v.name}${v.website ? ` (${v.website})` : ''} |
| Category | ${v.category} |
| Risk tier | ${computeTier({ ...v, dataAccess: v.dataAccess as string[] })} |
| Data access | ${data.join(', ') || 'None'} |
| Uses AI | ${v.usesAi ? `Yes${v.aiTrainsOnData === false ? ' (does not train on our data)' : v.aiTrainsOnData ? ' (may train on our data)' : ''}` : 'No'} |
| Reviewed by | ${actor} |
| Review date | ${now.toISOString().slice(0, 10)} |
| Outcome | ${outcome} |
| Residual risk | ${input.residualRisk} |

## Checklist
${REVIEW_CHECKLIST.map(c => `- ${input.checklist[c.id] ? '[x]' : '[ ]'} ${c.label}`).join('\n')}

## Documents on file
${v.documents.length ? v.documents.map(d => `- ${d.title} (${d.kind})${d.validUntil ? `, valid until ${d.validUntil.toISOString().slice(0, 10)}` : ''}`).join('\n') : '- None'}

## Notes
${input.notes || 'None'}
`;
  const html = policyHtmlDocument(`Vendor review: ${v.name}`, md, `${settings.organizationName} · vendor review recorded in ControlLayer by ${actor} on ${now.toISOString()}`);
  const evidence = await appendEvidence({
    title: `Vendor review: ${v.name} (${outcome.toLowerCase()})`,
    description: `Residual risk ${input.residualRisk}. Reviewed by ${actor}.`,
    kind: 'upload', source: `vendor:${v.id}`,
    file: { name: `vendor-review-${v.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${now.toISOString().slice(0, 10)}.html`, mimeType: 'text/html', data: new TextEncoder().encode(html) },
    controlIds: await controlIdsForKeys([...VENDOR_CONTROLS, ...(v.usesAi ? AI_VENDOR_CONTROLS : [])]),
    collectedBy: actor,
  });
  await prisma.vendorReview.create({ data: { vendorId, reviewer: actor, outcome: input.outcome, residualRisk: input.residualRisk, checklist: input.checklist, notes: input.notes || null, evidenceId: evidence.id, reviewedAt: now } });
  await prisma.vendor.update({ where: { id: vendorId }, data: { lastReviewedAt: now } });
  await recomputeAssessments();
  void anchorChain(actor).catch(err => console.error('[timestamp]', err));
  await logEvent({ action: 'Vendor reviewed', actor, decision: 'Completed', resource: v.name, reason: `${outcome}; residual risk ${input.residualRisk}` });
}

/** Saves the current vendor inventory as dated evidence (CSV). */
export async function snapshotInventory(actor: string) {
  const { vendors } = await vendorsData();
  const active = vendors.filter(v => v.status === 'active');
  const body = csv([
    ['Vendor', 'Category', 'Tier', 'Data access', 'Subprocessor', 'Uses AI', 'Trains on our data', 'DPA', 'BAA', 'Owner', 'Last review', 'Next review due', 'Open issues'],
    ...active.map(v => [v.name, v.category, v.tier, v.dataAccess.join('; '), v.subprocessor ? 'Yes' : 'No', v.usesAi ? 'Yes' : 'No',
      v.aiTrainsOnData === null ? 'Unknown' : v.aiTrainsOnData ? 'Yes' : 'No', v.dpaSigned ? 'Yes' : 'No', v.baaSigned ? 'Yes' : 'No',
      v.owner, v.lastReviewedAt?.slice(0, 10) ?? '', v.nextReviewDue?.slice(0, 10) ?? '', v.signals.map(s => s.text).join('; ')]),
  ]);
  await appendEvidence({
    title: `Vendor inventory (${active.length} vendors)`,
    description: 'Snapshot of all active vendors with risk tier, data access, agreements and review status.',
    kind: 'upload', source: 'vendors:inventory',
    file: { name: `vendor-inventory-${new Date().toISOString().slice(0, 10)}.csv`, mimeType: 'text/csv', data: new TextEncoder().encode(body) },
    controlIds: await controlIdsForKeys([...VENDOR_CONTROLS, ...(active.some(v => v.usesAi) ? AI_VENDOR_CONTROLS : [])]),
    collectedBy: actor,
  });
  await recomputeAssessments();
  await logEvent({ action: 'Vendor inventory saved as evidence', actor, decision: 'Completed', resource: `${active.length} vendors` });
  return active.length;
}

export async function sendVendorQuestionnaire(vendorId: string, sentTo: string, actor: string, origin: string) {
  const v = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { name: true } });
  if (!v) throw new HttpError(404, 'Vendor not found.');
  const token = randomBytes(24).toString('base64url');
  await prisma.vendorQuestionnaire.create({
    data: { vendorId, tokenHash: hashVendorToken(token), sentTo, sentBy: actor, expiresAt: new Date(Date.now() + 30 * 86_400_000) },
  });
  await logEvent({ action: 'Vendor questionnaire sent', actor, decision: 'Started', resource: v.name, reason: sentTo });
  return `${origin}/vendor-review/${token}`;
}

export async function vendorQuestionnaireForToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const q = await prisma.vendorQuestionnaire.findUnique({ where: { tokenHash: hashVendorToken(token) }, include: { vendor: { select: { name: true } } } });
  if (!q || q.status === 'revoked' || q.expiresAt < new Date()) return null;
  return q;
}

export async function submitVendorQuestionnaire(token: string, answers: Record<string, VendorAnswer>, respondent: string, report?: { name: string; mimeType: string; data: Uint8Array }) {
  const q = await vendorQuestionnaireForToken(token);
  if (!q) throw new HttpError(404, 'This link is no longer valid.');
  if (q.status === 'completed') throw new HttpError(409, 'This questionnaire was already submitted. Thank you!');
  const clean: Record<string, VendorAnswer> = {};
  for (const item of VENDOR_QUESTIONS) {
    const a = answers[item.id];
    if (!a || !['yes', 'partial', 'no', 'na'].includes(a.answer)) throw new HttpError(400, 'Please answer every question.');
    clean[item.id] = { answer: a.answer, comment: typeof a.comment === 'string' ? a.comment.slice(0, 2000) : undefined };
  }
  const score = scoreVendorAnswers(clean);
  await prisma.vendorQuestionnaire.update({ where: { id: q.id }, data: { status: 'completed', answers: clean as object, respondent, score, completedAt: new Date() } });
  if (report) {
    await prisma.vendorDocument.create({
      data: { vendorId: q.vendorId, kind: 'soc2', title: `Security report from ${q.vendor.name}`, fileName: report.name, mimeType: report.mimeType, fileSize: report.data.byteLength, fileData: Buffer.from(report.data), uploadedBy: respondent, validUntil: new Date(Date.now() + 365 * 86_400_000) },
    });
  }
  await logEvent({ action: 'Vendor questionnaire completed', actor: respondent, decision: 'Completed', resource: q.vendor.name, reason: `Score ${score}/100` });
  return score;
}
