import { afterEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, secretsAvailable } from './secrets';

const original = process.env.CONTROLLAYER_SECRET_KEY;
afterEach(() => {
  if (original === undefined) delete process.env.CONTROLLAYER_SECRET_KEY;
  else process.env.CONTROLLAYER_SECRET_KEY = original;
});

describe('secrets', () => {
  it('round-trips and never stores the plain value', () => {
    process.env.CONTROLLAYER_SECRET_KEY = 'test-key';
    const stored = encryptSecret({ accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'super-secret' });
    expect(stored).not.toContain('super-secret');
    expect(decryptSecret(stored)).toEqual({ accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'super-secret' });
  });

  it('uses a fresh IV each time', () => {
    process.env.CONTROLLAYER_SECRET_KEY = 'test-key';
    expect(encryptSecret('x')).not.toBe(encryptSecret('x'));
  });

  it('refuses to decrypt with a different key or tampered data', () => {
    process.env.CONTROLLAYER_SECRET_KEY = 'key-one';
    const stored = encryptSecret({ a: 1 });
    process.env.CONTROLLAYER_SECRET_KEY = 'key-two';
    expect(() => decryptSecret(stored)).toThrow(/could not be decrypted/);
    process.env.CONTROLLAYER_SECRET_KEY = 'key-one';
    const parts = stored.split('.');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptSecret(parts.join('.'))).toThrow();
  });

  it('is unavailable without a key', () => {
    delete process.env.CONTROLLAYER_SECRET_KEY;
    expect(secretsAvailable()).toBe(false);
    expect(() => encryptSecret('x')).toThrow(/CONTROLLAYER_SECRET_KEY/);
  });
});
