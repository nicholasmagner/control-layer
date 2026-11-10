import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { ANSWER_BANK } from './bank';
import type { Facts } from './facts';
import { similarity } from './match';
import { suggest } from './service';
import { extractQuestions, fillWorkbook, guessColumns, parseCsv, parseFile, questionsFromText } from './sheet';

function facts(over: Partial<Facts> = {}, checks: Record<string, 'pass' | 'fail'> = {}): Facts {
  return {
    org: 'Acme', sample: false, lastScan: new Date('2026-06-01'), connected: new Set(['aws', 'gworkspace']), awsRegions: ['us-east-1'],
    policies: new Map([['information-security', { title: 'Information Security Policy', version: 1, publishedAt: new Date(), owner: 'Jane Doe, CTO' }]]),
    people: { active: 10, acceptedPct: 100 }, frameworks: [{ id: 'SOC2', name: 'SOC 2', score: 80, status: 'Type II report available' }],
    trust: { enabled: true, documents: ['SOC 2 Type II report 2026'] }, devices: { total: 0, servers: 0, workstations: 0 },
    vendors: { total: 0, reviewedPct: null, critical: 0 }, risks: { open: 0, lastAssessed: null }, accessReviews: { lastCompleted: null, count: 0 },
    timestamps: true,
    check: ids => {
      const states = ids.map(id => checks[id]).filter(Boolean);
      const failed = states.filter(s => s === 'fail').length;
      return { state: !states.length ? 'unknown' : failed ? 'fail' : 'pass', passed: states.length - failed, failed, failing: failed ? ['x'] : [] };
    },
    ...over,
  };
}

describe('answer bank', () => {
  it('has unique keys and answers every entry without throwing', () => {
    expect(new Set(ANSWER_BANK.map(e => e.key)).size).toBe(ANSWER_BANK.length);
    for (const e of ANSWER_BANK) {
      const a = e.answer(facts());
      expect(a.text.length, e.key).toBeGreaterThan(10);
      expect(a.confidence).toBeGreaterThanOrEqual(0);
    }
  });

  it('answers MFA from live checks and drops confidence when checks fail', () => {
    const pass = suggest('Is two-factor authentication enforced for all employees?', facts({}, { 'aws.iam_user_mfa': 'pass', 'gworkspace.mfa_enforced': 'pass' }), []);
    expect(pass.source.type).toBe('builtin');
    expect(pass.source.key).toBe('mfa');
    expect(pass.answer).toMatch(/^Yes/);
    expect(pass.status).toBe('suggested');
    const fail = suggest('Is two-factor authentication enforced for all employees?', facts({}, { 'aws.iam_user_mfa': 'fail' }), []);
    expect(fail.confidence).toBeLessThan(pass.confidence);
  });

  it('uses the Trust Center status for audit report questions', () => {
    const s = suggest('Do you have a current SOC 2 Type II report?', facts(), []);
    expect(s.answer).toContain('Type II report available');
    expect(s.answer).toContain('Trust Center');
  });

  it('prefers your saved answers and leaves unknown questions for a person', () => {
    const lib = [{ id: 'l1', question: 'What is your uptime SLA?', answer: '99.9% monthly uptime.', builtinKey: null }];
    expect(suggest('What uptime SLA do you offer?', facts(), lib).answer).toBe('99.9% monthly uptime.');
    expect(suggest('What colour is your logo?', facts(), lib).status).toBe('needs_input');
  });

  it('matches common phrasings', () => {
    expect(similarity('Do you perform penetration testing annually?', ANSWER_BANK.find(e => e.key === 'pentest')!.questions, ANSWER_BANK.find(e => e.key === 'pentest')!.keywords)).toBeGreaterThan(0.5);
  });
});

describe('spreadsheets', () => {
  it('parses CSV with quotes and finds questions under section headings', () => {
    const rows = parseCsv('ID,Question,Response\nAccess control,,\n1,"Do you enforce MFA, for all users?",\n2,Is data encrypted at rest?,\n');
    const g = guessColumns(rows);
    expect(g).toEqual({ headerRow: 0, questionCol: 1, answerCol: 2 });
    const qs = extractQuestions(rows, g);
    expect(qs.map(q => q.question)).toEqual(['Do you enforce MFA, for all users?', 'Is data encrypted at rest?']);
    expect(qs[0].section).toBe('Access control');
    expect(qs[0].row).toBe(3);
  });

  it('strips numbering from pasted questions', () => {
    expect(questionsFromText('1. Do you use MFA?\n- Is data encrypted?\n\nok').map(q => q.question)).toEqual(['Do you use MFA?', 'Is data encrypted?']);
  });

  it('writes answers back into the original workbook', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Security');
    ws.addRow(['Ref', 'Question', 'Vendor Response']);
    ws.addRow(['A.1', 'Do you enforce multi-factor authentication?', '']);
    ws.addRow(['A.2', 'Do you have an incident response plan?', '']);
    const original = new Uint8Array(await wb.xlsx.writeBuffer());

    const parsed = await parseFile('q.xlsx', original);
    const g = guessColumns(parsed.sheets[0].rows);
    expect(g.answerCol).toBe(2);
    const qs = extractQuestions(parsed.sheets[0].rows, g);
    const out = await fillWorkbook(original, 'Security', g.headerRow, g.answerCol, qs.map(q => ({ row: q.row, answer: `Answer to ${q.question.slice(0, 10)}` })));

    const back = new ExcelJS.Workbook();
    await back.xlsx.load(Buffer.from(out) as unknown as ArrayBuffer);
    expect(back.getWorksheet('Security')!.getRow(2).getCell(3).value).toBe('Answer to Do you enf');
    expect(back.getWorksheet('Security')!.getRow(1).getCell(1).value).toBe('Ref');
  });
});
