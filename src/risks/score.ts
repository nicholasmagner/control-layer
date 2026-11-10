/** Risk scoring: likelihood x impact on 1-5 scales (1-25). */

export const LIKELIHOOD = ['', 'Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'];
export const IMPACT = ['', 'Minimal', 'Minor', 'Moderate', 'Major', 'Severe'];
export const LIKELIHOOD_HELP = ['', 'Not expected in the next few years', 'Could happen in the next few years', 'Could happen this year', 'Expected this year', 'Expected several times a year'];
export const IMPACT_HELP = ['', 'Barely noticeable', 'Small cost or inconvenience, no customer impact', 'Some customers affected or notable cost', 'Serious customer, legal or financial harm', 'Threatens the business'];

export type Level = 'critical' | 'high' | 'medium' | 'low';

export function level(score: number): Level {
  if (score >= 20) return 'critical';
  if (score >= 12) return 'high';
  if (score >= 6) return 'medium';
  return 'low';
}

export interface RiskSignalInput {
  status: string;
  owner: string | null;
  likelihood: number;
  impact: number;
  residualLikelihood: number | null;
  residualImpact: number | null;
  treatment: string;
  treatmentPlan: string | null;
  acceptedUntil: Date | null;
  reviewedAt: Date | null;
  createdAt: Date;
  failingChecks: number;
}

export function residualScore(r: Pick<RiskSignalInput, 'likelihood' | 'impact' | 'residualLikelihood' | 'residualImpact'>) {
  return (r.residualLikelihood ?? r.likelihood) * (r.residualImpact ?? r.impact);
}

/** What needs attention on a risk. */
export function riskSignals(r: RiskSignalInput, now: Date): { id: string; text: string; level: 'high' | 'medium' }[] {
  if (r.status === 'closed') return [];
  const out: { id: string; text: string; level: 'high' | 'medium' }[] = [];
  const residual = level(residualScore(r));
  if (!r.owner) out.push({ id: 'no_owner', text: 'No owner', level: 'medium' });
  if ((residual === 'high' || residual === 'critical') && r.status !== 'accepted' && !r.treatmentPlan?.trim()) {
    out.push({ id: 'no_plan', text: 'High risk without a treatment plan', level: 'high' });
  }
  if (r.status === 'accepted' && r.acceptedUntil && r.acceptedUntil < now) out.push({ id: 'acceptance_expired', text: 'Risk acceptance has expired', level: 'high' });
  const since = r.reviewedAt ?? r.createdAt;
  if (now.getTime() - since.getTime() > 365 * 86_400_000) out.push({ id: 'review_overdue', text: 'Not reviewed in over a year', level: 'medium' });
  if (r.failingChecks > 0) out.push({ id: 'failing_checks', text: `${r.failingChecks} failing check${r.failingChecks === 1 ? '' : 's'} make this more likely`, level: 'high' });
  return out;
}
