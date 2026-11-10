import { createHash } from 'node:crypto';

/**
 * Tamper-evidence for the evidence library.
 *
 * Each artifact stores:
 *   sha256    - hash of its content (uploaded file bytes, or canonical JSON)
 *   prevHash  - chainHash of the artifact before it (null for the first one)
 *   chainHash - hash over prevHash + the artifact's metadata + sha256
 *
 * Changing any artifact's content or metadata, deleting one, or reordering
 * them breaks every chainHash after that point, which verifyChain detects.
 * Anyone holding the latest chainHash (it is printed in every audit export)
 * can later confirm that nothing before it was rewritten.
 */

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

/** JSON with object keys sorted at every level, so equal data hashes equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>).sort().map(k => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export function contentHash(input: { fileData?: Uint8Array | null; content?: unknown }): string {
  if (input.fileData) return sha256Hex(input.fileData);
  return sha256Hex(canonicalJson(input.content ?? null));
}

export interface ChainFields {
  sha256: string;
  title: string;
  kind: string;
  source: string;
  collectedAt: Date;
}

export function chainHash(prevHash: string | null, f: ChainFields): string {
  return sha256Hex([prevHash ?? 'GENESIS', f.kind, f.source, f.title, f.collectedAt.toISOString(), f.sha256].join('|'));
}

export interface ChainRow extends ChainFields {
  id: string;
  seq: number;
  prevHash: string | null;
  chainHash: string | null;
  fileData?: Uint8Array | null;
  content?: unknown;
}

export interface ChainVerification {
  ok: boolean;
  /** Artifacts that are part of the chain and were checked. */
  checked: number;
  /** Artifacts recorded before hashing existed (not covered). */
  legacy: number;
  /** Latest chainHash: record it to detect later rewrites. */
  head: string | null;
  problem?: { seq: number; id: string; reason: string };
}

/** Rows must be ordered by seq ascending and include content / fileData. */
export function verifyChain(rows: ChainRow[]): ChainVerification {
  let prev: string | null = null;
  let checked = 0;
  let legacy = 0;

  for (const row of rows) {
    if (!row.chainHash) {
      // Pre-chain rows are only acceptable before the chain starts.
      if (prev !== null) return { ok: false, checked, legacy, head: prev, problem: { seq: row.seq, id: row.id, reason: 'Unhashed record inserted after the chain started.' } };
      legacy++;
      continue;
    }
    const actualContent = contentHash({ fileData: row.fileData, content: row.content });
    if (actualContent !== row.sha256) {
      return { ok: false, checked, legacy, head: prev, problem: { seq: row.seq, id: row.id, reason: 'Content does not match its recorded fingerprint (it was modified).' } };
    }
    if (row.prevHash !== prev) {
      return { ok: false, checked, legacy, head: prev, problem: { seq: row.seq, id: row.id, reason: 'Link to the previous record is broken (a record was removed or reordered).' } };
    }
    if (chainHash(prev, row) !== row.chainHash) {
      return { ok: false, checked, legacy, head: prev, problem: { seq: row.seq, id: row.id, reason: 'Record details (title, date, source) were modified.' } };
    }
    prev = row.chainHash;
    checked++;
  }
  return { ok: true, checked, legacy, head: prev };
}
