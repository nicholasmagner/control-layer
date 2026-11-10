import { describe, expect, it } from 'vitest';
import { computeStatus, readinessScore } from './status';

const check = (failed: number, passed = 1, title = 'Check') => ({ checkId: title, title, passed, failed });

describe('computeStatus', () => {
  it('respects Not Applicable with the given reason', () => {
    expect(computeStatus({ applicable: false, naReason: 'No availability commitments', checks: [check(3)], currentManualEvidence: 0 }))
      .toEqual({ status: 'Not Applicable', justification: 'No availability commitments' });
  });

  it('is Met when every automated check passes', () => {
    expect(computeStatus({ applicable: true, checks: [check(0), check(0)], currentManualEvidence: 0 }).status).toBe('Met');
  });

  it('is Partially Met when some checks fail', () => {
    const r = computeStatus({ applicable: true, checks: [check(0, 2, 'A'), check(1, 1, 'B')], currentManualEvidence: 0 });
    expect(r.status).toBe('Partially Met');
    expect(r.justification).toContain('B (1 failing)');
  });

  it('is Not Met when every check fails, even with documents on file', () => {
    expect(computeStatus({ applicable: true, checks: [check(2, 0)], currentManualEvidence: 4 }).status).toBe('Not Met');
  });

  it('falls back to uploaded evidence when no check covers the control', () => {
    expect(computeStatus({ applicable: true, checks: [], currentManualEvidence: 1 }).status).toBe('Met');
    expect(computeStatus({ applicable: true, checks: [], currentManualEvidence: 0 }).status).toBe('Needs Evidence');
  });

  it('ignores checks that evaluated no resources', () => {
    expect(computeStatus({ applicable: true, checks: [{ checkId: 'x', title: 'x', passed: 0, failed: 0 }], currentManualEvidence: 0 }).status).toBe('Needs Evidence');
  });
});

describe('readinessScore', () => {
  it('excludes Not Applicable controls', () => {
    expect(readinessScore(['Met', 'Not Met', 'Not Applicable', 'Not Applicable'])).toBe(50);
    expect(readinessScore([])).toBe(0);
  });
});
