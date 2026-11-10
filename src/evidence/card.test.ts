import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { formatUtc, MAX_CARD_ROWS, renderEvidenceCard, type CardInput } from './card';

const base: CardInput = {
  organization: 'Acme Inc', provider: 'Amazon Web Services', account: '111122223333', checkTitle: 'Console users have MFA',
  checkDescription: 'Every console user should use MFA.', dataSource: 'AWS IAM GetCredentialReport',
  capturedAt: new Date('2026-11-05T20:43:12Z'), collectedBy: 'maria@acme.example', controls: ['SOC 2 CC6.1'],
  rows: [{ resource: 'alice', status: 'pass', message: 'alice has MFA enabled.' }],
  dataFingerprint: 'a'.repeat(64), runId: 'run-1', reason: 'First evidence image for this check', appVersion: '0.3.0',
};

describe('renderEvidenceCard', () => {
  it('renders a PNG that grows with the number of rows, up to the row cap', async () => {
    const small = await sharp(Buffer.from(await renderEvidenceCard(base))).metadata();
    const rows = Array.from({ length: MAX_CARD_ROWS + 20 }, (_, i) => ({ resource: `user${i}`, status: 'fail' as const, message: 'no MFA' }));
    const big = await sharp(Buffer.from(await renderEvidenceCard({ ...base, rows }))).metadata();
    expect(small.format).toBe('png');
    expect(small.width).toBe(1600);
    expect(big.height!).toBeGreaterThan(small.height! + 40 * (MAX_CARD_ROWS - 1));
    expect(big.height!).toBeLessThan(small.height! + 60 * (MAX_CARD_ROWS + 5));
  });

  it('renders an account with no resources', async () => {
    const png = await renderEvidenceCard({ ...base, rows: [] });
    expect((await sharp(Buffer.from(png)).metadata()).format).toBe('png');
  });
});

describe('formatUtc', () => {
  it('always states the time zone', () => {
    expect(formatUtc(new Date('2026-01-02T03:04:05.678Z'))).toBe('2026-01-02 03:04:05 UTC');
  });
});
