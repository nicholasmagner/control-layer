import { Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma';
import { logEvent } from '@/lib/events';
import { chainHash, contentHash, verifyChain, type ChainVerification } from './hash';
import { inspectToken, requestTimestamp, tsaUrl } from './timestamp';

// Arbitrary constant used as the Postgres advisory lock key that serializes
// appends to the evidence chain.
const CHAIN_LOCK_KEY = 4_217_001;

export interface NewEvidence {
  title: string;
  description?: string;
  /** automated = scan data record, snapshot = evidence image rendered from it. */
  kind: 'automated' | 'snapshot' | 'upload' | 'note';
  source: string;
  content?: Prisma.InputJsonValue;
  file?: { name: string; mimeType: string; data: Uint8Array };
  /** Control row ids (Control.id) this evidence supports. */
  controlIds: string[];
  collectedBy?: string;
  /** Sample evidence is kept out of the chain and out of audit exports. */
  isSample?: boolean;
}

/** Appends an artifact to the evidence library (and the hash chain). */
export async function appendEvidence(input: NewEvidence) {
  const collectedAt = new Date();
  const sha256 = contentHash({ fileData: input.file?.data, content: input.content });
  const base = {
    title: input.title,
    description: input.description,
    kind: input.kind,
    source: input.source,
    content: input.content,
    fileName: input.file?.name,
    mimeType: input.file?.mimeType,
    fileSize: input.file?.data.byteLength,
    fileData: input.file ? Buffer.from(input.file.data) : undefined,
    sha256,
    collectedAt,
    collectedBy: input.collectedBy,
    isSample: !!input.isSample,
    controls: { create: input.controlIds.map(controlId => ({ controlId })) },
  };

  if (input.isSample) {
    return prisma.evidenceArtifact.create({ data: base, select: { id: true, sha256: true } });
  }

  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${CHAIN_LOCK_KEY})`;
    const last = await tx.evidenceArtifact.findFirst({
      where: { chainHash: { not: null } },
      orderBy: { seq: 'desc' },
      select: { chainHash: true },
    });
    const prevHash = last?.chainHash ?? null;
    return tx.evidenceArtifact.create({
      data: { ...base, prevHash, chainHash: chainHash(prevHash, { ...base, sha256 }) },
      select: { id: true, sha256: true },
    });
  });
}

/**
 * Gets an RFC 3161 timestamp for the current chain head, so a third party
 * attests that every record up to it existed at that time. One request covers
 * the whole chain, so this runs once per scan or upload, not per record.
 * Failures are logged and never block evidence collection.
 */
export async function anchorChain(actor: string) {
  const url = tsaUrl();
  if (!url) return null;
  const head = await prisma.evidenceArtifact.findFirst({
    where: { chainHash: { not: null } },
    orderBy: { seq: 'desc' },
    select: { seq: true, chainHash: true },
  });
  if (!head?.chainHash) return null;
  const latest = await prisma.chainAnchor.findFirst({ orderBy: { seq: 'desc' }, select: { chainHash: true } });
  if (latest?.chainHash === head.chainHash) return null;

  try {
    const { token, info } = await requestTimestamp(head.chainHash, url);
    return await prisma.chainAnchor.create({
      data: { seq: head.seq, chainHash: head.chainHash, tsaUrl: url, token: Buffer.from(token), genTime: info.genTime },
      select: { id: true, genTime: true, seq: true },
    });
  } catch (err) {
    console.error('[timestamp] could not timestamp the evidence chain', err);
    await logEvent({
      action: 'Independent timestamp', actor, decision: 'Failed', resource: url,
      reason: `${err instanceof Error ? err.message : String(err)} It will be retried after the next evidence is added.`,
    });
    return null;
  }
}

export interface AnchorVerification {
  count: number;
  valid: number;
  latest: { genTime: string; seq: number; tsaUrl: string } | null;
  problem?: { seq: number; reason: string };
}

export type FullVerification = ChainVerification & { anchors: AnchorVerification };

/** Re-reads every non-sample artifact, verifies the chain and every timestamp token. */
export async function verifyEvidenceChain(): Promise<FullVerification> {
  const rows = await prisma.evidenceArtifact.findMany({
    where: { isSample: false },
    orderBy: { seq: 'asc' },
    select: {
      id: true, seq: true, title: true, kind: true, source: true, collectedAt: true,
      sha256: true, prevHash: true, chainHash: true, content: true, fileData: true,
    },
  });
  const chain = verifyChain(rows.map(r => ({ ...r, sha256: r.sha256 ?? '' })));

  const anchors = await prisma.chainAnchor.findMany({ orderBy: { seq: 'asc' } });
  const bySeq = new Map(rows.map(r => [r.seq, r.chainHash]));
  const result: AnchorVerification = { count: anchors.length, valid: 0, latest: null };
  for (const a of anchors) {
    const info = await inspectToken(new Uint8Array(a.token));
    let reason: string | null = null;
    if (bySeq.get(a.seq) !== a.chainHash) reason = 'The evidence chain no longer matches a timestamp taken earlier (records before it were rewritten or removed).';
    else if (info.digestHex !== a.chainHash) reason = 'Timestamp token does not cover the recorded chain head.';
    else if (!info.signatureValid) reason = 'Timestamp token signature is invalid.';
    if (reason) {
      result.problem ??= { seq: a.seq, reason };
      continue;
    }
    result.valid++;
    result.latest = { genTime: info.genTime.toISOString(), seq: a.seq, tsaUrl: a.tsaUrl };
  }
  return { ...chain, ok: chain.ok && !result.problem, anchors: result };
}
