import { Prisma } from '@prisma/client';
import { prisma } from '@/db/prisma';
import { chainHash, contentHash, verifyChain, type ChainVerification } from './hash';

// Arbitrary constant used as the Postgres advisory lock key that serializes
// appends to the evidence chain.
const CHAIN_LOCK_KEY = 4_217_001;

export interface NewEvidence {
  title: string;
  description?: string;
  kind: 'automated' | 'upload' | 'note';
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
    return prisma.evidenceArtifact.create({ data: base, select: { id: true } });
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
      select: { id: true },
    });
  });
}

/** Re-reads every non-sample artifact and verifies the whole chain. */
export async function verifyEvidenceChain(): Promise<ChainVerification> {
  const rows = await prisma.evidenceArtifact.findMany({
    where: { isSample: false },
    orderBy: { seq: 'asc' },
    select: {
      id: true, seq: true, title: true, kind: true, source: true, collectedAt: true,
      sha256: true, prevHash: true, chainHash: true, content: true, fileData: true,
    },
  });
  return verifyChain(rows.map(r => ({ ...r, sha256: r.sha256 ?? '' })));
}
