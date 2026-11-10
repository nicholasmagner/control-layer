import { describe, expect, it } from 'vitest';
import { canonicalJson, chainHash, contentHash, verifyChain, type ChainRow } from './hash';

function buildChain(items: { title: string; content?: unknown; file?: string }[]): ChainRow[] {
  let prev: string | null = null;
  return items.map((item, i) => {
    const fileData = item.file ? new TextEncoder().encode(item.file) : null;
    const sha256 = contentHash({ fileData, content: item.content });
    const row: ChainRow = {
      id: `e${i}`, seq: i + 1, title: item.title, kind: item.file ? 'upload' : 'automated', source: 'test',
      collectedAt: new Date(Date.UTC(2026, 0, i + 1)), sha256, prevHash: prev, chainHash: null,
      fileData, content: item.content,
    };
    row.chainHash = chainHash(prev, row);
    prev = row.chainHash;
    return row;
  });
}

const sample = () => buildChain([
  { title: 'MFA report', content: { users: 3, failing: 1 } },
  { title: 'Security policy', file: '# Policy v1' },
  { title: 'CloudTrail', content: { trails: ['main'] } },
]);

describe('canonicalJson', () => {
  it('is independent of key order (Postgres JSONB reorders keys)', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [{ y: 1, x: 2 }] } })).toBe(canonicalJson({ a: { c: [{ x: 2, y: 1 }], d: 2 }, b: 1 }));
  });
});

describe('verifyChain', () => {
  it('accepts an untouched chain and reports its head', () => {
    const rows = sample();
    const v = verifyChain(rows);
    expect(v).toMatchObject({ ok: true, checked: 3, legacy: 0 });
    expect(v.head).toBe(rows[2].chainHash);
  });

  it('detects modified JSON content', () => {
    const rows = sample();
    rows[0].content = { users: 3, failing: 0 };
    expect(verifyChain(rows)).toMatchObject({ ok: false, problem: { seq: 1 } });
  });

  it('detects a modified uploaded file', () => {
    const rows = sample();
    rows[1].fileData = new TextEncoder().encode('# Policy v2');
    expect(verifyChain(rows).problem?.reason).toMatch(/Content/);
  });

  it('detects changed metadata such as the collection date', () => {
    const rows = sample();
    rows[2].collectedAt = new Date(Date.UTC(2025, 0, 1));
    expect(verifyChain(rows).problem?.reason).toMatch(/details/);
  });

  it('detects a deleted record', () => {
    const rows = sample();
    rows.splice(1, 1);
    expect(verifyChain(rows)).toMatchObject({ ok: false, problem: { seq: 3 } });
  });

  it('detects a fully recomputed record that was not re-linked', () => {
    const rows = sample();
    rows[0].content = { users: 3, failing: 0 };
    rows[0].sha256 = contentHash({ content: rows[0].content });
    rows[0].chainHash = chainHash(null, rows[0]);
    expect(verifyChain(rows)).toMatchObject({ ok: false, problem: { seq: 2 } });
  });

  it('allows legacy unhashed records only before the chain starts', () => {
    const legacy: ChainRow = { id: 'old', seq: 0, title: 'old', kind: 'automated', source: 'x', collectedAt: new Date(0), sha256: '', prevHash: null, chainHash: null };
    expect(verifyChain([legacy, ...sample()])).toMatchObject({ ok: true, legacy: 1, checked: 3 });
    const rows = sample();
    expect(verifyChain([rows[0], { ...legacy, seq: 2 }, ...rows.slice(1)]).ok).toBe(false);
  });
});
