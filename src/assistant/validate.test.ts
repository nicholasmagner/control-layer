import { describe, it, expect } from 'vitest';
import { isValidHistory, MAX_MESSAGES, MAX_MESSAGE_LENGTH } from './validate';

describe('isValidHistory', () => {
  it('accepts a well-formed message list', () => {
    expect(isValidHistory([{ role: 'user', content: 'hi' }])).toBe(true);
  });

  it('rejects a non-array', () => {
    expect(isValidHistory('not an array')).toBe(false);
    expect(isValidHistory(null)).toBe(false);
    expect(isValidHistory(undefined)).toBe(false);
  });

  it('rejects an empty array', () => {
    expect(isValidHistory([])).toBe(false);
  });

  it('rejects more than MAX_MESSAGES entries', () => {
    const tooMany = Array.from({ length: MAX_MESSAGES + 1 }, () => ({ role: 'user', content: 'x' }));
    expect(isValidHistory(tooMany)).toBe(false);
  });

  it('rejects an invalid role', () => {
    expect(isValidHistory([{ role: 'system', content: 'hi' }])).toBe(false);
  });

  it('rejects a message over MAX_MESSAGE_LENGTH', () => {
    expect(isValidHistory([{ role: 'user', content: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) }])).toBe(false);
  });

  it('rejects a message with empty content', () => {
    expect(isValidHistory([{ role: 'user', content: '' }])).toBe(false);
  });

  it('rejects non-string content (e.g. an object trying to smuggle extra data)', () => {
    expect(isValidHistory([{ role: 'user', content: { injected: true } }])).toBe(false);
  });
});
