import ExcelJS from 'exceljs';

/**
 * Reading customers' questionnaires (Excel or CSV) and writing the answers
 * back into the original workbook, so they can send it straight back.
 */

export interface SheetData {
  name: string;
  rows: string[][];
}

export interface ParsedFile {
  kind: 'xlsx' | 'csv';
  sheets: SheetData[];
}

export interface ColumnGuess {
  headerRow: number; // 0-based index into rows; -1 when there is no header
  questionCol: number;
  answerCol: number | null;
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map(r => r.text).join('');
    if ('text' in v && typeof v.text === 'string') return v.text;
    if ('result' in v) return v.result === undefined || v.result === null ? '' : String(v.result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return '';
  }
  return String(v);
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let quoted = false;
  const t = text.replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cur); cur = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.map(r => r.map(c => c.trim()));
}

export async function parseFile(name: string, data: Uint8Array): Promise<ParsedFile> {
  if (/\.csv$/i.test(name) || /\.txt$/i.test(name)) {
    return { kind: 'csv', sheets: [{ name: 'Questions', rows: parseCsv(new TextDecoder().decode(data)) }] };
  }
  if (!/\.xlsx$/i.test(name)) throw new Error('Upload an Excel (.xlsx) or CSV file. Older .xls files: save as .xlsx first.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
  const sheets: SheetData[] = [];
  wb.eachSheet(ws => {
    if (ws.state && ws.state !== 'visible') return;
    const rows: string[][] = [];
    const last = Math.min(ws.rowCount, 5000);
    for (let r = 1; r <= last; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 60); c++) cells.push(cellText(row.getCell(c).value).trim());
      rows.push(cells);
    }
    sheets.push({ name: ws.name, rows });
  });
  if (!sheets.length) throw new Error('The workbook has no visible sheets.');
  return { kind: 'xlsx', sheets };
}

const looksLikeQuestion = (s: string) => s.length >= 12 && (/\?\s*$/.test(s) || /^(do|does|is|are|has|have|can|will|describe|explain|provide|how|what|who|when|where|please|list)\b/i.test(s));

/** Finds the header row, the question column and an answer column, if any. */
export function guessColumns(rows: string[][]): ColumnGuess {
  const width = Math.max(0, ...rows.slice(0, 200).map(r => r.length));
  let headerRow = -1;
  for (let r = 0; r < Math.min(rows.length, 25); r++) {
    if (rows[r].some(c => /^(question|questions|control question|requirement|item|description)s?\b/i.test(c))) { headerRow = r; break; }
  }
  const body = rows.slice(headerRow + 1, headerRow + 400);
  let questionCol = 0;
  let best = -1;
  for (let c = 0; c < width; c++) {
    const header = headerRow >= 0 ? rows[headerRow][c] ?? '' : '';
    const values = body.map(r => r[c] ?? '').filter(Boolean);
    const score = values.filter(looksLikeQuestion).length * 3 + values.reduce((n, v) => n + Math.min(v.length, 200), 0) / 100
      + (/question/i.test(header) ? 50 : 0);
    if (score > best) { best = score; questionCol = c; }
  }
  let answerCol: number | null = null;
  if (headerRow >= 0) {
    const hdr = rows[headerRow];
    const pick = (re: RegExp) => hdr.findIndex((h, i) => i !== questionCol && re.test(h));
    const i = [/^(vendor )?(answer|response)s?\b/i, /answer|response/i, /comment|explanation|details|notes/i].map(pick).find(x => x >= 0);
    answerCol = i === undefined ? null : i;
  }
  return { headerRow, questionCol, answerCol };
}

export interface ExtractedQuestion {
  row: number; // 1-based spreadsheet row
  section: string | null;
  question: string;
}

/** Questions from a sheet, with section headings carried down. */
export function extractQuestions(rows: string[][], guess: ColumnGuess): ExtractedQuestion[] {
  const out: ExtractedQuestion[] = [];
  let section: string | null = null;
  for (let r = guess.headerRow + 1; r < rows.length; r++) {
    const cells = rows[r];
    const q = (cells[guess.questionCol] ?? '').trim();
    const filled = cells.filter(Boolean);
    if (!q) {
      if (filled.length === 1 && filled[0].length < 80) section = filled[0];
      continue;
    }
    if (q.length < 8 || (!looksLikeQuestion(q) && q.length < 25 && filled.length === 1)) {
      if (q.length < 80) section = q;
      continue;
    }
    out.push({ row: r + 1, section, question: q.slice(0, 4000) });
  }
  return out;
}

/** Questions from pasted text: one per line (numbering is removed). */
export function questionsFromText(text: string): ExtractedQuestion[] {
  return text.split(/\r?\n/).map(l => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim()).filter(l => l.length >= 8)
    .map((question, i) => ({ row: i + 1, section: null, question: question.slice(0, 4000) }));
}

/** Writes answers into the original workbook (adding an "Answer" column if needed). */
export async function fillWorkbook(
  data: Uint8Array,
  sheetName: string,
  headerRow: number | null,
  answerCol: number | null,
  answers: { row: number; answer: string }[],
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(data) as unknown as ArrayBuffer);
  const ws = wb.getWorksheet(sheetName);
  if (!ws) throw new Error(`Sheet "${sheetName}" was not found in the original file.`);
  let col = answerCol === null ? null : answerCol + 1;
  if (col === null) {
    col = ws.columnCount + 1;
    const hr = headerRow !== null && headerRow >= 0 ? headerRow + 1 : null;
    if (hr) {
      const cell = ws.getRow(hr).getCell(col);
      cell.value = 'Answer';
      cell.font = { bold: true };
    }
    ws.getColumn(col).width = 70;
  }
  for (const a of answers) {
    const cell = ws.getRow(a.row).getCell(col);
    cell.value = a.answer;
    cell.alignment = { wrapText: true, vertical: 'top' };
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** A fresh workbook for questionnaires that came from pasted text or CSV. */
export async function newWorkbook(title: string, items: { section: string | null; question: string; answer: string; status: string }[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' ') || 'Questionnaire');
  ws.columns = [
    { header: '#', width: 6 }, { header: 'Section', width: 24 }, { header: 'Question', width: 60 }, { header: 'Answer', width: 80 },
  ];
  ws.getRow(1).font = { bold: true };
  items.forEach((it, i) => {
    const row = ws.addRow([i + 1, it.section ?? '', it.question, it.answer]);
    row.alignment = { wrapText: true, vertical: 'top' };
  });
  return new Uint8Array(await wb.xlsx.writeBuffer());
}
