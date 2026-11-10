import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { SOC2 } from '@/frameworks/soc2';
import { sha256Hex } from './hash';
import { buildAuditPackage, csv, safeName, type PackageEvidence } from './package';

const evidence = (over: Partial<PackageEvidence>): PackageEvidence => ({
  id: 'e1', seq: 1, title: 'AWS: Console users have MFA', description: null, kind: 'automated', source: 'aws:aws.iam_user_mfa',
  collectedAt: new Date('2026-03-01T10:00:00Z'), collectedBy: 'maria@acme.example', sha256: 'abc', chainHash: 'def',
  fileName: null, mimeType: null, fileData: null, content: { passing: 3 }, ...over,
});

async function build() {
  const policy = evidence({ id: 'e2', seq: 2, title: 'Security policy', kind: 'upload', fileName: 'policy.pdf', fileData: new TextEncoder().encode('%PDF-fake') });
  return buildAuditPackage({
    framework: SOC2,
    organization: 'Acme',
    period: { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-12-31T23:59:59Z') },
    generatedAt: new Date('2027-01-05T00:00:00Z'),
    generatedBy: 'Maria <maria@acme.example>',
    isSample: false,
    controls: [
      { controlId: 'CC6.1', title: 'Logical access security', description: 'd', category: 'c', status: 'Met', justification: 'ok', owner: 'Maria', expectedEvidence: ['MFA'], evidence: [evidence({}), policy] },
      { controlId: 'CC2.2', title: 'Internal communication', description: 'd', category: 'c', status: 'Met', justification: 'ok', owner: null, expectedEvidence: [], evidence: [policy] },
      { controlId: 'CC9.2', title: 'Vendor risk', description: 'd', category: 'c', status: 'Needs Evidence', justification: 'none', owner: null, expectedEvidence: ['Vendor list'], evidence: [] },
    ],
    findings: [{ title: '=HYPERLINK("x")', severity: 'High', status: 'Open', resource: 'r', description: 'has, comma', createdAt: new Date('2026-02-01'), resolvedAt: null, acceptReason: null, acceptedBy: null }],
    events: [],
    chain: { ok: true, checked: 2, legacy: 0, head: 'def' },
    timestamps: [],
  });
}

describe('buildAuditPackage', () => {
  it('lays out one folder per control with the evidence files and a manifest', async () => {
    const { zip, fileName } = await build();
    expect(fileName).toBe('SOC 2 evidence 2026-01-01 to 2026-12-31.zip');
    const archive = await JSZip.loadAsync(zip);
    const root = 'SOC 2 evidence 2026-01-01 to 2026-12-31/';
    const names = Object.keys(archive.files);
    expect(names).toContain(`${root}README.txt`);
    expect(names).toContain(`${root}00-control-summary.csv`);
    expect(names).toContain(`${root}controls/CC6.1 Logical access security/20260301T100000 policy.pdf`);
    expect(names).toContain(`${root}controls/CC2.2 Internal communication/20260301T100000 policy.pdf`);
    expect(names).toContain(`${root}controls/CC9.2 Vendor risk/_control.txt`);

    const manifest = JSON.parse(await archive.file(`${root}manifest.json`)!.async('string'));
    for (const f of manifest.files) {
      const bytes = await archive.file(root + f.path)!.async('uint8array');
      expect(sha256Hex(bytes), f.path).toBe(f.sha256);
    }

    const index = await archive.file(`${root}03-evidence-index.csv`)!.async('string');
    expect(index.trim().split('\r\n')).toHaveLength(3); // header + 2 unique records
    expect(index).toContain('CC6.1; CC2.2');

    const vendor = await archive.file(`${root}controls/CC9.2 Vendor risk/_control.txt`)!.async('string');
    expect(vendor).toContain('No evidence was collected');
  });

  it('neutralizes spreadsheet formulas in CSV output', async () => {
    const archive = await JSZip.loadAsync((await build()).zip);
    const findings = await archive.file('SOC 2 evidence 2026-01-01 to 2026-12-31/01-findings.csv')!.async('string');
    expect(findings).toContain(`"'=HYPERLINK(""x"")"`);
    expect(findings).toContain('"has, comma"');
  });
});

describe('helpers', () => {
  it('escapes CSV and sanitizes file names', () => {
    expect(csv([['a', 'b"c', null]])).toBe('a,"b""c",\r\n');
    expect(safeName('CC6.1 Access: "admin"/root?')).toBe('CC6.1 Access- -admin-root-');
  });
});
