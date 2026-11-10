import { describe, expect, it } from 'vitest';
import { getCheck } from '@/checks';
import { DEFAULT_TRUST, mergeTrustConfig } from './config';
import { PRACTICES, verifiedPractices } from './public';

describe('Trust Center practices', () => {
  it('only reference checks that exist', () => {
    for (const p of PRACTICES) for (const id of p.checks) expect(getCheck(id), `${p.id} -> ${id}`).toBeDefined();
  });

  it('show a practice only when its checks ran and none fail', () => {
    const outcomes = new Map([
      ['aws.root_mfa', { checkId: 'aws.root_mfa', title: '', passed: 1, failed: 0 }],
      ['aws.iam_user_mfa', { checkId: 'aws.iam_user_mfa', title: '', passed: 3, failed: 0 }],
      ['aws.s3_encryption', { checkId: 'aws.s3_encryption', title: '', passed: 2, failed: 1 }],
      ['aws.cloudtrail_enabled', { checkId: 'aws.cloudtrail_enabled', title: '', passed: 0, failed: 0 }],
    ]);
    expect(verifiedPractices(outcomes).map(p => p.id)).toEqual(['mfa']);
  });
});

describe('mergeTrustConfig', () => {
  it('updates only the fields sent and validates them', () => {
    const next = mergeTrustConfig(DEFAULT_TRUST, { headline: ' Security ', frameworks: [{ id: 'SOC2', status: 'Type II report available' }] });
    expect(next.headline).toBe('Security');
    expect(next.frameworks).toEqual([{ id: 'SOC2', status: 'Type II report available' }]);
    expect(next.description).toBe(DEFAULT_TRUST.description);
    expect(() => mergeTrustConfig(DEFAULT_TRUST, { contactEmail: 'nope' })).toThrow(/email/);
    expect(() => mergeTrustConfig(DEFAULT_TRUST, { frameworks: [{ id: 'XYZ' }] })).toThrow(/framework/);
    expect(() => mergeTrustConfig(DEFAULT_TRUST, { accessDays: 0 })).toThrow();
    expect(mergeTrustConfig(DEFAULT_TRUST, { ndaText: '' }).ndaText).toBe(DEFAULT_TRUST.ndaText);
  });
});
