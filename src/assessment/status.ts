export type ControlStatus = 'Met' | 'Partially Met' | 'Not Met' | 'Needs Evidence' | 'Not Applicable';

export interface CheckOutcome {
  checkId: string;
  title: string;
  passed: number;
  failed: number;
}

export interface StatusInput {
  applicable: boolean;
  naReason?: string | null;
  /** Latest result of each automated check mapped to the control. */
  checks: CheckOutcome[];
  /** Uploaded documents / notes still within the control's freshness window. */
  currentManualEvidence: number;
}

/**
 * Deterministic control status. Automated checks decide controls they cover;
 * controls without automated coverage depend on current uploaded evidence.
 */
export function computeStatus(input: StatusInput): { status: ControlStatus; justification: string } {
  if (!input.applicable) {
    return { status: 'Not Applicable', justification: input.naReason?.trim() || 'Marked out of scope.' };
  }

  const evaluated = input.checks.filter(c => c.passed + c.failed > 0);
  if (evaluated.length > 0) {
    const failing = evaluated.filter(c => c.failed > 0);
    const docs = input.currentManualEvidence ? ` ${input.currentManualEvidence} supporting document(s) on file.` : '';
    if (failing.length === 0) {
      return { status: 'Met', justification: `All ${evaluated.length} automated check(s) pass.${docs}` };
    }
    const summary = failing.map(c => `${c.title} (${c.failed} failing)`).join('; ');
    if (failing.length === evaluated.length) {
      return { status: 'Not Met', justification: `Failing: ${summary}.` };
    }
    return { status: 'Partially Met', justification: `${evaluated.length - failing.length} of ${evaluated.length} checks pass. Failing: ${summary}.` };
  }

  if (input.currentManualEvidence > 0) {
    return { status: 'Met', justification: `${input.currentManualEvidence} current evidence document(s) on file.` };
  }
  return { status: 'Needs Evidence', justification: 'No automated check covers this control. Upload evidence to show it is in place.' };
}

/** Share of applicable controls that are Met (0-100). */
export function readinessScore(statuses: ControlStatus[]): number {
  const applicable = statuses.filter(s => s !== 'Not Applicable');
  if (applicable.length === 0) return 0;
  return Math.round((applicable.filter(s => s === 'Met').length / applicable.length) * 100);
}
