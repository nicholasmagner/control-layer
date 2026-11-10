/**
 * Vendor risk rules, kept pure so they're easy to test and explain:
 * a tier from what the vendor can access, a review cadence from the tier,
 * and the gaps ("signals") an auditor or customer would ask about.
 */

export type Tier = 'critical' | 'high' | 'medium' | 'low';

export interface VendorFacts {
  status: string;
  dataAccess: string[];
  businessCritical: boolean;
  usesAi: boolean;
  aiTrainsOnData: boolean | null;
  subprocessor: boolean;
  tierOverride: string | null;
  dpaSigned: boolean;
  baaSigned: boolean;
  contractEnd: Date | null;
  lastReviewedAt: Date | null;
  documents: { kind: string; validUntil: Date | null }[];
  /** When the vendor last completed our security questionnaire (a substitute for a report). */
  questionnaireCompletedAt?: Date | null;
}

const SENSITIVE = ['customer_data', 'personal_data', 'health_data', 'payment_data'];

export function computeTier(v: Pick<VendorFacts, 'dataAccess' | 'businessCritical' | 'usesAi' | 'tierOverride'>): Tier {
  if (v.tierOverride && ['critical', 'high', 'medium', 'low'].includes(v.tierOverride)) return v.tierOverride as Tier;
  const sensitive = v.dataAccess.some(d => SENSITIVE.includes(d));
  if (sensitive && v.businessCritical) return 'critical';
  if (sensitive || v.dataAccess.includes('credentials') || v.dataAccess.includes('source_code') || v.businessCritical) return 'high';
  if (v.dataAccess.length || v.usesAi) return 'medium';
  return 'low';
}

/** Days between reviews for a tier (null = no periodic review needed). */
export const REVIEW_DAYS: Record<Tier, number | null> = { critical: 365, high: 365, medium: 730, low: null };

export function nextReviewDue(tier: Tier, lastReviewedAt: Date | null, createdAt: Date): Date | null {
  const days = REVIEW_DAYS[tier];
  if (!days) return null;
  // New vendors should be reviewed within 30 days of being added.
  return lastReviewedAt ? new Date(lastReviewedAt.getTime() + days * 86_400_000) : new Date(createdAt.getTime() + 30 * 86_400_000);
}

export interface Signal {
  id: string;
  level: 'high' | 'medium' | 'low';
  text: string;
}

export function vendorSignals(v: VendorFacts, ctx: { now: Date; hipaa: boolean; createdAt: Date }): Signal[] {
  if (v.status !== 'active') return [];
  const tier = computeTier(v);
  const out: Signal[] = [];
  const day = 86_400_000;
  const report = v.documents.filter(d => d.kind === 'soc2' || d.kind === 'iso27001');
  const current = report.filter(d => !d.validUntil || d.validUntil > ctx.now);
  const answered = !!v.questionnaireCompletedAt && ctx.now.getTime() - v.questionnaireCompletedAt.getTime() < 365 * day;
  if ((tier === 'critical' || tier === 'high') && !current.length && !answered) {
    out.push({ id: 'no_report', level: 'high', text: report.length ? 'Security report (SOC 2 / ISO 27001) has expired' : 'No security report (SOC 2 / ISO 27001) on file' });
  } else if (current.some(d => d.validUntil && d.validUntil.getTime() - ctx.now.getTime() < 45 * day)) {
    out.push({ id: 'report_expiring', level: 'medium', text: 'Security report expires within 45 days' });
  }
  const personal = v.dataAccess.some(d => ['customer_data', 'personal_data', 'health_data'].includes(d));
  if (personal && !v.dpaSigned) out.push({ id: 'no_dpa', level: 'high', text: 'No data processing agreement (DPA)' });
  if (ctx.hipaa && v.dataAccess.includes('health_data') && !v.baaSigned) out.push({ id: 'no_baa', level: 'high', text: 'No business associate agreement (BAA)' });
  if (v.usesAi && v.aiTrainsOnData !== false && v.dataAccess.length) {
    out.push({ id: 'ai_training', level: v.aiTrainsOnData ? 'high' : 'medium', text: v.aiTrainsOnData ? 'May train AI models on your data' : 'Unknown whether it trains AI on your data' });
  }
  const due = nextReviewDue(tier, v.lastReviewedAt, ctx.createdAt);
  if (due && due < ctx.now) out.push({ id: 'review_overdue', level: tier === 'critical' || tier === 'high' ? 'high' : 'medium', text: v.lastReviewedAt ? 'Review overdue' : 'Not reviewed yet' });
  if (v.contractEnd && v.contractEnd > ctx.now && v.contractEnd.getTime() - ctx.now.getTime() < 45 * day) {
    out.push({ id: 'contract_ending', level: 'low', text: 'Contract ends within 45 days' });
  }
  return out;
}

/** Questions vendors answer from their link, with weights for a 0-100 score. */
export const VENDOR_QUESTIONS: { id: string; topic: string; question: string; weight: number }[] = [
  { id: 'report', topic: 'Assurance', question: 'Do you have a current SOC 2 Type II report or ISO 27001 certificate?', weight: 3 },
  { id: 'pentest', topic: 'Assurance', question: 'Do you have an independent penetration test at least annually?', weight: 2 },
  { id: 'policy', topic: 'Governance', question: 'Do you have documented information security policies reviewed at least annually?', weight: 2 },
  { id: 'training', topic: 'Governance', question: 'Do all employees complete security awareness training at least annually?', weight: 1 },
  { id: 'background', topic: 'Governance', question: 'Do you perform background checks on employees with access to customer data?', weight: 1 },
  { id: 'mfa', topic: 'Access', question: 'Is multi-factor authentication required for all access to systems with our data?', weight: 3 },
  { id: 'access_review', topic: 'Access', question: 'Do you review access to systems with our data at least quarterly, and remove access promptly when people leave?', weight: 2 },
  { id: 'encryption', topic: 'Data', question: 'Is our data encrypted at rest (AES-256 or equivalent) and in transit (TLS 1.2+)?', weight: 3 },
  { id: 'retention', topic: 'Data', question: 'Will you delete or return our data at the end of the contract?', weight: 2 },
  { id: 'subprocessors', topic: 'Data', question: 'Do you keep a list of your subprocessors and notify customers of changes?', weight: 1 },
  { id: 'ai_training', topic: 'Data', question: 'Do you commit not to use our data to train AI models without our written consent?', weight: 2 },
  { id: 'logging', topic: 'Operations', question: 'Do you log and monitor access to systems that hold our data?', weight: 2 },
  { id: 'vulns', topic: 'Operations', question: 'Do you patch critical vulnerabilities within 30 days?', weight: 2 },
  { id: 'backups', topic: 'Operations', question: 'Do you back up data and test restores at least annually?', weight: 1 },
  { id: 'incident', topic: 'Incidents', question: 'Do you have an incident response plan, and will you notify us of a breach affecting our data within 72 hours?', weight: 3 },
];

export type VendorAnswer = { answer: 'yes' | 'partial' | 'no' | 'na'; comment?: string };

export function scoreVendorAnswers(answers: Record<string, VendorAnswer>): number {
  let total = 0;
  let got = 0;
  for (const q of VENDOR_QUESTIONS) {
    const a = answers[q.id]?.answer;
    if (!a || a === 'na') continue;
    total += q.weight;
    got += a === 'yes' ? q.weight : a === 'partial' ? q.weight / 2 : 0;
  }
  return total ? Math.round((got / total) * 100) : 0;
}
