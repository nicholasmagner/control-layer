import { describe, expect, it } from 'vitest';
import { hashPassword, passwordProblem, verifyPassword } from './password';

describe('password hashing', () => {
  it('verifies the right password and rejects the wrong one', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery', stored)).toBe(true);
    expect(await verifyPassword('correct horse batterz', stored)).toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same password here')).not.toBe(await hashPassword('same password here'));
  });

  it('rejects malformed stored values', async () => {
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
  });

  it('enforces a minimum length', () => {
    expect(passwordProblem('short')).toMatch(/12 characters/);
    expect(passwordProblem(undefined)).toMatch(/12 characters/);
    expect(passwordProblem('long enough password')).toBeNull();
  });
});
