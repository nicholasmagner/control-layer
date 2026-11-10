import { describe, expect, it } from 'vitest';
import { getCheck } from '@/checks';
import { getControlDef } from '@/frameworks';
import { RISK_LIBRARY } from './library';
import { level, residualScore, riskSignals } from './score';

describe('risk library', () => {
  it('only links controls and checks that exist', () => {
    expect(new Set(RISK_LIBRARY.map(r => r.key)).size).toBe(RISK_LIBRARY.length);
    for (const r of RISK_LIBRARY) {
      for (const k of r.controls) { const i = k.indexOf(':'); expect(getControlDef(k.slice(0, i), k.slice(i + 1)), `${r.key} -> ${k}`).toBeDefined(); }
      for (const c of r.checks) expect(getCheck(c), `${r.key} -> ${c}`).toBeDefined();
      expect(r.likelihood).toBeGreaterThanOrEqual(1);
      expect(r.impact).toBeLessThanOrEqual(5);
    }
  });
});

describe('risk scoring', () => {
  it('levels scores', () => {
    expect([level(25), level(20), level(16), level(12), level(9), level(6), level(5), level(1)]).toEqual(['critical', 'critical', 'high', 'high', 'medium', 'medium', 'low', 'low']);
    expect(residualScore({ likelihood: 4, impact: 5, residualLikelihood: 2, residualImpact: null })).toBe(10);
  });

  it('flags what needs attention', () => {
    const now = new Date('2026-06-01T00:00:00Z');
    const base = { status: 'open', owner: 'a@b.c', likelihood: 4, impact: 4, residualLikelihood: null, residualImpact: null, treatment: 'mitigate', treatmentPlan: null, acceptedUntil: null, reviewedAt: now, createdAt: now, failingChecks: 0 };
    expect(riskSignals(base, now).map(s => s.id)).toEqual(['no_plan']);
    expect(riskSignals({ ...base, treatmentPlan: 'MFA', owner: null, failingChecks: 2 }, now).map(s => s.id)).toEqual(['no_owner', 'failing_checks']);
    expect(riskSignals({ ...base, status: 'accepted', acceptedUntil: new Date('2026-01-01'), reviewedAt: new Date('2025-01-01') }, now).map(s => s.id)).toEqual(['acceptance_expired', 'review_overdue']);
    expect(riskSignals({ ...base, status: 'closed' }, now)).toEqual([]);
  });
});
