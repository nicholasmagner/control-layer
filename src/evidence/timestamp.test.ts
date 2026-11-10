import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseTsaUrl } from '@/lib/settings';
import { buildRequest, inspectToken } from './timestamp';

// A real token issued by freetsa.org for sha256("hello controllayer").
const TOKEN = new Uint8Array(readFileSync(path.join(__dirname, 'fixtures', 'freetsa-token.tsr')));
const DIGEST = createHash('sha256').update('hello controllayer').digest('hex');

describe('RFC 3161 tokens', () => {
  it('reads the timestamped digest and time, and verifies the signature', async () => {
    const info = await inspectToken(TOKEN);
    expect(info.digestHex).toBe(DIGEST);
    expect(info.genTime.getUTCFullYear()).toBe(2026);
    expect(info.signatureValid).toBe(true);
  });

  it('rejects a token whose signed content was altered', async () => {
    const tampered = new Uint8Array(TOKEN);
    tampered[tampered.length - 5] ^= 0xff;
    expect((await inspectToken(tampered)).signatureValid).toBe(false);
  });

  it('builds a DER request', () => {
    const req = buildRequest(DIGEST, new Uint8Array([1, 2, 3, 4]));
    expect(req[0]).toBe(0x30);
    expect(Buffer.from(req).toString('hex')).toContain(DIGEST);
  });

  it('can be turned off', () => {
    expect(parseTsaUrl('off')).toBeNull();
    expect(parseTsaUrl('')).toBe('https://freetsa.org/tsr');
    expect(parseTsaUrl('https://tsa.example/tsr')).toBe('https://tsa.example/tsr');
  });
});
