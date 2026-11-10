import { describe, expect, it } from 'vitest';
import { VENDOR_CATALOG } from './catalog';
import { computeTier, nextReviewDue, scoreVendorAnswers, vendorSignals, VENDOR_QUESTIONS, type VendorFacts } from './risk';

const now = new Date('2026-06-01T00:00:00Z');
const base: VendorFacts = {
  status: 'active', dataAccess: [], businessCritical: false, usesAi: false, aiTrainsOnData: null, subprocessor: false, tierOverride: null,
  dpaSigned: false, baaSigned: false, contractEnd: null, lastReviewedAt: null, documents: [],
};

describe('vendor tiers', () => {
  it('follow data access and criticality', () => {
    expect(computeTier({ ...base, dataAccess: ['customer_data'], businessCritical: true })).toBe('critical');
    expect(computeTier({ ...base, dataAccess: ['payment_data'] })).toBe('high');
    expect(computeTier({ ...base, dataAccess: ['source_code'] })).toBe('high');
    expect(computeTier({ ...base, dataAccess: ['internal_data'] })).toBe('medium');
    expect(computeTier({ ...base, usesAi: true })).toBe('medium');
    expect(computeTier(base)).toBe('low');
    expect(computeTier({ ...base, dataAccess: ['customer_data'], tierOverride: 'low' })).toBe('low');
  });

  it('set review dates by tier', () => {
    const created = new Date('2026-01-01T00:00:00Z');
    expect(nextReviewDue('high', null, created)?.toISOString().slice(0, 10)).toBe('2026-01-31');
    expect(nextReviewDue('critical', new Date('2026-02-01T00:00:00Z'), created)?.toISOString().slice(0, 10)).toBe('2027-02-01');
    expect(nextReviewDue('low', null, created)).toBeNull();
  });
});

describe('vendor signals', () => {
  it('flag missing reports, agreements, AI training and overdue reviews', () => {
    const v = { ...base, dataAccess: ['customer_data', 'health_data'], usesAi: true, businessCritical: true };
    const ids = vendorSignals(v, { now, hipaa: true, createdAt: new Date('2025-01-01') }).map(s => s.id);
    expect(ids).toEqual(['no_report', 'no_dpa', 'no_baa', 'ai_training', 'review_overdue']);
  });

  it('are quiet for a well-managed vendor', () => {
    const v = {
      ...base, dataAccess: ['customer_data'], dpaSigned: true, usesAi: true, aiTrainsOnData: false, lastReviewedAt: new Date('2026-03-01'),
      documents: [{ kind: 'soc2', validUntil: new Date('2026-12-01') }],
    };
    expect(vendorSignals(v, { now, hipaa: false, createdAt: new Date('2025-01-01') })).toEqual([]);
    expect(vendorSignals({ ...v, status: 'offboarded', dpaSigned: false }, { now, hipaa: false, createdAt: now })).toEqual([]);
  });

  it('accept a recently completed questionnaire instead of a report', () => {
    const v = { ...base, dataAccess: ['customer_data'], dpaSigned: true, lastReviewedAt: now, questionnaireCompletedAt: new Date('2026-05-01') };
    expect(vendorSignals(v, { now, hipaa: false, createdAt: now })).toEqual([]);
  });

  it('warn about expiring reports', () => {
    const v = { ...base, dataAccess: ['customer_data'], dpaSigned: true, lastReviewedAt: now, documents: [{ kind: 'soc2', validUntil: new Date('2026-06-20') }] };
    expect(vendorSignals(v, { now, hipaa: false, createdAt: now }).map(s => s.id)).toEqual(['report_expiring']);
  });
});

describe('vendor questionnaire', () => {
  it('scores weighted answers and ignores N/A', () => {
    const all = (a: 'yes' | 'no' | 'partial' | 'na') => Object.fromEntries(VENDOR_QUESTIONS.map(q => [q.id, { answer: a }]));
    expect(scoreVendorAnswers(all('yes'))).toBe(100);
    expect(scoreVendorAnswers(all('no'))).toBe(0);
    expect(scoreVendorAnswers(all('partial'))).toBe(50);
    expect(scoreVendorAnswers({ ...all('na'), mfa: { answer: 'yes' } })).toBe(100);
  });

  it('catalog entries are unique and use known data types', () => {
    expect(new Set(VENDOR_CATALOG.map(c => c.name)).size).toBe(VENDOR_CATALOG.length);
    const known = new Set(['customer_data', 'personal_data', 'health_data', 'payment_data', 'source_code', 'credentials', 'employee_data', 'internal_data']);
    for (const c of VENDOR_CATALOG) for (const d of c.dataAccess) expect(known.has(d), `${c.name}: ${d}`).toBe(true);
  });
});
