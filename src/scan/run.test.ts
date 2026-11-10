import { describe, expect, it } from 'vitest';
import { resultsKey } from './run';

describe('resultsKey', () => {
  const r = (id: string, status: 'pass' | 'fail', message = '') => ({ resourceId: id, status, message });
  it('ignores order and wording that changes daily', () => {
    expect(resultsKey([r('a', 'pass', 'key is 10 days old'), r('b', 'fail')]))
      .toBe(resultsKey([r('b', 'fail', 'x'), r('a', 'pass', 'key is 11 days old')]));
  });
  it('changes when a resource flips or appears', () => {
    const k = resultsKey([r('a', 'pass')]);
    expect(resultsKey([r('a', 'fail')])).not.toBe(k);
    expect(resultsKey([r('a', 'pass'), r('b', 'pass')])).not.toBe(k);
  });
});
