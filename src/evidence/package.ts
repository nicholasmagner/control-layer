import JSZip from 'jszip';
import type { FrameworkDef } from '@/frameworks';
import { sha256Hex, type ChainVerification } from './hash';

/**
 * Builds the audit evidence package: a ZIP an auditor can work through
 * control by control, with a manifest of SHA-256 fingerprints for every file.
 */

export interface PackageEvidence {
  id: string;
  seq: number;
  title: string;
  description: string | null;
  kind: string;
  source: string;
  collectedAt: Date;
  collectedBy: string | null;
  sha256: string | null;
  chainHash: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileData: Uint8Array | null;
  content: unknown;
}

export interface PackageControl {
  controlId: string;
  title: string;
  description: string;
  category: string;
  status: string;
  justification: string;
  owner: string | null;
  expectedEvidence: string[];
  evidence: PackageEvidence[];
}

export interface PackageInput {
  framework: FrameworkDef;
  organization: string;
  period: { from: Date; to: Date };
  generatedAt: Date;
  generatedBy: string;
  isSample: boolean;
  controls: PackageControl[];
  findings: { title: string; severity: string; status: string; resource: string | null; description: string; createdAt: Date; resolvedAt: Date | null; acceptReason: string | null; acceptedBy: string | null }[];
  events: { timestamp: Date; actor: string; action: string; decision: string; resource: string | null; reason: string | null }[];
  chain: ChainVerification & { anchors?: { count: number; valid: number; latest: { genTime: string; tsaUrl: string } | null } };
  timestamps: { seq: number; chainHash: string; genTime: Date; tsaUrl: string; token: Uint8Array }[];
  /** Extra tables (e.g. policy acceptance), written as CSV files at these paths. */
  extras?: { path: string; rows: (string | number | null | undefined)[][] }[];
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function csv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map(r => r.map(v => {
      const s = v === null || v === undefined ? '' : String(v);
      // Neutralize spreadsheet formula injection and quote when needed.
      const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
      return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
    }).join(','))
    .join('\r\n') + '\r\n';
}

export function safeName(s: string, max = 80): string {
  return s.replace(/[\\/:*?"<>|\x00-\x1f]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, max).replace(/[. ]+$/, '') || 'item';
}

function evidenceFileName(e: PackageEvidence): string {
  const stamp = e.collectedAt.toISOString().replace(/[-:]/g, '').slice(0, 15);
  if (e.fileName) return `${stamp} ${safeName(e.fileName, 100)}`;
  return `${stamp} ${safeName(e.title, 90)}.json`;
}

function evidenceBody(e: PackageEvidence): Uint8Array | string {
  if (e.fileData) return e.fileData;
  return JSON.stringify({
    title: e.title, description: e.description, source: e.source, kind: e.kind,
    collectedAt: e.collectedAt.toISOString(), collectedBy: e.collectedBy, recordId: e.id,
    fingerprint: e.sha256, content: e.content,
  }, null, 2);
}

export async function buildAuditPackage(input: PackageInput): Promise<{ zip: Uint8Array; fileName: string }> {
  const { framework, period } = input;
  const root = safeName(`${framework.shortName} evidence ${day(period.from)} to ${day(period.to)}`);
  const zip = new JSZip();
  const files: { path: string; sha256: string; bytes: number }[] = [];
  const add = (path: string, data: Uint8Array | string) => {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    zip.file(`${root}/${path}`, bytes, { date: input.generatedAt });
    files.push({ path, sha256: sha256Hex(bytes), bytes: bytes.byteLength });
  };

  const evidenceIndex: (string | number | null)[][] = [[
    'Record ID', 'Sequence', 'Title', 'Type', 'Source', 'Collected at (UTC)', 'Collected by', 'Content SHA-256', 'Chain hash', 'Control(s)', 'File in package',
  ]];
  const seenEvidence = new Map<string, { row: (string | number | null)[]; controls: string[] }>();

  const summary: (string | number | null)[][] = [[
    'Control', 'Title', 'Category', 'Status', 'Status reason', 'Owner', 'Evidence items in period', 'Latest evidence (UTC)', 'Folder',
  ]];

  for (const c of input.controls) {
    const folder = `controls/${safeName(`${c.controlId} ${c.title}`)}`;
    const latest = c.evidence.reduce<Date | null>((m, e) => (!m || e.collectedAt > m ? e.collectedAt : m), null);
    summary.push([c.controlId, c.title, c.category, c.status, c.justification, c.owner, c.evidence.length, latest?.toISOString() ?? '', folder]);

    add(`${folder}/_control.txt`, [
      `${framework.name} - ${c.controlId}: ${c.title}`,
      `Category: ${c.category}`,
      '',
      c.description,
      '',
      `Status: ${c.status}`,
      `Reason: ${c.justification}`,
      `Owner: ${c.owner ?? 'Not assigned'}`,
      '',
      'Evidence auditors typically request:',
      ...c.expectedEvidence.map(e => `  - ${e}`),
      '',
      c.evidence.length ? `${c.evidence.length} evidence item(s) in this folder.` : 'No evidence was collected for this control in the audit period.',
    ].join('\r\n'));

    const usedNames = new Set<string>();
    for (const e of c.evidence) {
      let name = evidenceFileName(e);
      for (let i = 2; usedNames.has(name); i++) name = name.replace(/(\.[^.]*)?$/, ` (${i})$1`);
      usedNames.add(name);
      const path = `${folder}/${name}`;
      add(path, evidenceBody(e));

      const existing = seenEvidence.get(e.id);
      if (existing) {
        existing.controls.push(c.controlId);
      } else {
        const row: (string | number | null)[] = [e.id, e.seq, e.title, e.kind, e.source, e.collectedAt.toISOString(), e.collectedBy, e.sha256, e.chainHash, '', path];
        seenEvidence.set(e.id, { row, controls: [c.controlId] });
      }
    }
  }
  for (const { row, controls } of [...seenEvidence.values()].sort((a, b) => Number(a.row[1]) - Number(b.row[1]))) {
    row[9] = controls.join('; ');
    evidenceIndex.push(row);
  }

  add('00-control-summary.csv', csv(summary));
  add('01-findings.csv', csv([
    ['Title', 'Severity', 'Status', 'Resource', 'Description', 'Opened (UTC)', 'Resolved (UTC)', 'Risk accepted by', 'Risk acceptance reason'],
    ...input.findings.map(f => [f.title, f.severity, f.status, f.resource, f.description, f.createdAt.toISOString(), f.resolvedAt?.toISOString() ?? '', f.acceptedBy, f.acceptReason]),
  ]));
  add('02-activity-log.csv', csv([
    ['Time (UTC)', 'Actor', 'Action', 'Result', 'Resource', 'Details'],
    ...input.events.map(e => [e.timestamp.toISOString(), e.actor, e.action, e.decision, e.resource, e.reason]),
  ]));
  add('03-evidence-index.csv', csv(evidenceIndex));
  for (const extra of input.extras ?? []) add(extra.path, csv(extra.rows));

  if (input.timestamps.length) {
    const rows: (string | number)[][] = [['Covers records up to #', 'Chain hash (timestamped digest)', 'Timestamp (UTC)', 'Authority', 'Token file']];
    for (const t of input.timestamps) {
      const file = `timestamps/record-${String(t.seq).padStart(6, '0')}_${t.genTime.toISOString().replace(/[-:]/g, '').slice(0, 15)}.tsr`;
      add(file, t.token);
      rows.push([t.seq, t.chainHash, t.genTime.toISOString(), t.tsaUrl, file]);
    }
    add('timestamps/index.csv', csv(rows));
    add('timestamps/HOW-TO-VERIFY.txt', [
      'Each .tsr file is an RFC 3161 timestamp token signed by an independent Time-Stamp Authority.',
      'It proves that the evidence chain, up to the record shown in index.csv, existed at the stated time.',
      '',
      'To verify a token with OpenSSL (FreeTSA shown; download the authority\'s certificates first):',
      '  curl -O https://freetsa.org/files/tsa.crt',
      '  curl -O https://freetsa.org/files/cacert.pem',
      '  openssl ts -verify -digest <chain hash from index.csv> -token_in -in <token file> -CAfile cacert.pem -untrusted tsa.crt',
      '',
      'Expected output: "Verification: OK". Then confirm the same chain hash appears for that record',
      'number in ../03-evidence-index.csv. To inspect a token: openssl ts -reply -token_in -in <token file> -text',
    ].join('\r\n'));
  }

  const statusCounts = input.controls.reduce<Record<string, number>>((m, c) => ({ ...m, [c.status]: (m[c.status] ?? 0) + 1 }), {});
  const chainLine = input.chain.ok
    ? `VERIFIED - ${input.chain.checked} record(s) checked${input.chain.legacy ? `, ${input.chain.legacy} older record(s) predate fingerprinting` : ''}.`
    : `FAILED at record #${input.chain.problem?.seq}: ${input.chain.problem?.reason}`;

  add('README.txt', [
    ...(input.isSample ? ['*** SAMPLE DATA - generated from the built-in sample company. Not for audit use. ***', ''] : []),
    `${framework.name} evidence package`,
    `Organization: ${input.organization}`,
    `Audit period: ${day(period.from)} to ${day(period.to)}`,
    `Generated: ${input.generatedAt.toISOString()} by ${input.generatedBy}`,
    '',
    'Control status at time of export:',
    ...Object.entries(statusCounts).map(([s, n]) => `  ${s}: ${n}`),
    '',
    'Contents',
    '  00-control-summary.csv  Every control with its status, owner and amount of evidence.',
    '  01-findings.csv         Security findings, including resolved ones and accepted risks.',
    '  02-activity-log.csv     Who did what in ControlLayer during the period.',
    '  03-evidence-index.csv   Every evidence record with its fingerprint and the controls it supports.',
    ...(input.extras?.some(e => e.path.startsWith('04-')) ? [
      '  04-policy-acceptance.csv  Each person\'s sign-off status for the current version of every policy.',
      '  05-policy-signatures.csv  Every policy acceptance on record, with the SHA-256 of the exact text accepted.',
    ] : []),
    '  controls/               One folder per control: _control.txt plus the evidence files.',
    '  manifest.json           SHA-256 of every file in this package.',
    '',
    'Integrity',
    '  Evidence records are fingerprinted (SHA-256) when collected and linked in a hash chain, so',
    '  any later change, deletion or reordering is detectable.',
    `  Chain verification at export: ${chainLine}`,
    `  Chain head: ${input.chain.head ?? 'n/a'}`,
    '  Record the chain head. A later export whose chain still contains this value shows that',
    '  nothing collected before today was altered.',
    input.timestamps.length
      ? `  Independent timestamps: ${input.timestamps.length} RFC 3161 token(s) in timestamps/, latest ${input.timestamps[input.timestamps.length - 1].genTime.toISOString()} from ${input.timestamps[input.timestamps.length - 1].tsaUrl}. See timestamps/HOW-TO-VERIFY.txt.`
      : '  Independent timestamps: none in this package.',
    '  Evidence images (.png) are rendered from scan data; each shows the SHA-256 of the data record it was drawn from.',
    '  For uploaded files, the content SHA-256 in 03-evidence-index.csv equals the SHA-256 of the',
    '  file in this package. Automated scan results are fingerprinted over their canonical JSON',
    '  content; the exported .json adds descriptive fields around that content.',
  ].join('\r\n'));

  const manifest = {
    framework: framework.id,
    frameworkVersion: framework.version,
    organization: input.organization,
    period: { from: period.from.toISOString(), to: period.to.toISOString() },
    generatedAt: input.generatedAt.toISOString(),
    generatedBy: input.generatedBy,
    sampleData: input.isSample,
    chain: input.chain,
    files,
  };
  zip.file(`${root}/manifest.json`, JSON.stringify(manifest, null, 2), { date: input.generatedAt });

  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { zip: out, fileName: `${root}.zip` };
}
