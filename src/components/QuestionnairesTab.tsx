'use client';

import { ArrowLeft, Bot, Check, CheckCheck, ClipboardList, Download, FileSpreadsheet, Globe, Library, Plus, RefreshCw, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatDate, inputBase, inputCls, Modal, PageHeader } from './ui';

type Item = {
  id: string; position: number; section: string | null; question: string; answer: string; status: 'suggested' | 'approved' | 'needs_input';
  confidence: number; source: { type: string; title?: string; sources?: string[]; match?: number } | null; approvedBy: string | null;
};
type Detail = { id: string; name: string; customer: string | null; dueDate: string | null; status: string; fileName: string | null; createdAt: string; items: Item[] };

export default function QuestionnairesTab({ data, refresh }: TabProps) {
  const [view, setView] = useState<'list' | 'library'>('list');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canEdit = data.user.role !== 'auditor';

  if (openId) return <QuestionnaireDetail id={openId} canEdit={canEdit} assistant={data.features.assistant} onBack={() => { setOpenId(null); refresh(); }} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Security questionnaires"
        subtitle="Upload a customer's questionnaire and get it answered from your live security data. Review, approve, and download it back in the same spreadsheet."
        actions={canEdit && <Button onClick={() => setCreating(true)}><Plus size={15} /> New questionnaire</Button>}
      />
      <div className="flex gap-2">
        {([['list', 'Questionnaires', ClipboardList], ['library', 'Answer library', Library]] as const).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setView(id)}
            className={cx('flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium', view === id ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-slate-800')}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        data.questionnaires.length === 0 ? (
          <Card className="p-8">
            <Empty icon={FileSpreadsheet} title="No questionnaires yet">
              <p>Customers send security questionnaires before they buy. Upload one (Excel or CSV, or paste the questions) and ControlLayer drafts every answer it can from your checks, policies and setup, usually most of them.</p>
              {canEdit && <div className="mt-4"><Button onClick={() => setCreating(true)}><Upload size={15} /> Upload a questionnaire</Button></div>}
            </Empty>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data.questionnaires.map(q => {
              const pct = q.total ? Math.round((q.approved / q.total) * 100) : 0;
              const overdue = q.dueDate && q.status !== 'completed' && new Date(q.dueDate) < new Date();
              return (
                <button key={q.id} onClick={() => setOpenId(q.id)} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-left transition-colors hover:border-sky-500/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-100">{q.name}</p>
                      <p className="truncate text-xs text-slate-500">{q.customer ?? 'No customer set'} · added {formatDate(q.createdAt)}</p>
                    </div>
                    {q.status === 'completed'
                      ? <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">Sent</span>
                      : q.dueDate && <span className={cx('whitespace-nowrap text-[11px]', overdue ? 'text-red-400' : 'text-slate-400')}>Due {formatDate(q.dueDate)}</span>}
                  </div>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} /></div>
                  <p className="mt-2 text-xs text-slate-400">{q.approved} of {q.total} approved{q.needsInput ? <> · <span className="text-amber-300">{q.needsInput} need input</span></> : ''}</p>
                </button>
              );
            })}
          </div>
        )
      ) : <AnswerLibrary canEdit={canEdit} />}

      {creating && <NewQuestionnaire onClose={() => setCreating(false)} onCreated={id => { setCreating(false); refresh(); setOpenId(id); }} />}
    </div>
  );
}

// --- New questionnaire --------------------------------------------------------------

type Preview = { kind: string; sheets: { name: string; guess: { headerRow: number; questionCol: number; answerCol: number | null }; columns: { index: number; header: string; sample: string }[]; questionCount: number }[] };

function NewQuestionnaire({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [mode, setMode] = useState<'file' | 'paste'>('file');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sheet, setSheet] = useState('');
  const [qCol, setQCol] = useState(0);
  const [aCol, setACol] = useState<string>('new');
  const [text, setText] = useState('');
  const [form, setForm] = useState({ name: '', customer: '', dueDate: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const current = preview?.sheets.find(s => s.name === sheet);

  async function choose(f: File | undefined) {
    if (!f) return;
    setFile(f);
    setError('');
    setForm(x => ({ ...x, name: x.name || f.name.replace(/\.(xlsx|csv)$/i, '') }));
    const body = new FormData();
    body.set('file', f);
    try {
      const p = await api<Preview>('/api/questionnaires/preview', { method: 'POST', body });
      setPreview(p);
      const s = p.sheets[0];
      setSheet(s.name);
      setQCol(s.guess.questionCol);
      setACol(s.guess.answerCol === null ? 'new' : String(s.guess.answerCol));
    } catch (e) {
      setError((e as Error).message);
      setPreview(null);
    }
  }

  async function create() {
    setBusy(true);
    setError('');
    const body = new FormData();
    body.set('name', form.name);
    body.set('customer', form.customer);
    body.set('dueDate', form.dueDate);
    if (mode === 'file' && file) {
      body.set('file', file);
      body.set('sheet', sheet);
      body.set('questionCol', String(qCol));
      body.set('answerCol', aCol);
    } else body.set('text', text);
    try {
      const r = await api<{ id: string }>('/api/questionnaires', { method: 'POST', body });
      onCreated(r.id);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="New questionnaire" onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex gap-1 rounded-lg bg-slate-950 p-1 text-sm">
          {([['file', 'Upload a file'], ['paste', 'Paste questions']] as const).map(([m, label]) => (
            <button key={m} onClick={() => setMode(m)} className={cx('flex-1 rounded-md py-1.5', mode === m ? 'bg-slate-800 font-medium text-slate-100' : 'text-slate-400')}>{label}</button>
          ))}
        </div>

        {mode === 'file' ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-700 p-6 text-center hover:border-sky-500/60">
              <FileSpreadsheet className="text-sky-400" />
              <span className="text-sm text-slate-300">{file ? file.name : 'Choose the questionnaire (.xlsx or .csv)'}</span>
              <span className="text-xs text-slate-500">Answers are written back into this file when you download it.</span>
              <input type="file" accept=".xlsx,.csv" className="hidden" onChange={e => choose(e.target.files?.[0])} />
            </label>
            {preview && current && (
              <div className="grid gap-3 md:grid-cols-3">
                {preview.sheets.length > 1 && (
                  <Field label="Sheet">
                    <select className={inputCls} value={sheet} onChange={e => {
                      const s = preview.sheets.find(x => x.name === e.target.value)!;
                      setSheet(s.name); setQCol(s.guess.questionCol); setACol(s.guess.answerCol === null ? 'new' : String(s.guess.answerCol));
                    }}>
                      {preview.sheets.map(s => <option key={s.name} value={s.name}>{s.name} ({s.questionCount} questions)</option>)}
                    </select>
                  </Field>
                )}
                <Field label="Questions are in" hint={current.columns[qCol]?.sample ? `e.g. "${current.columns[qCol].sample.slice(0, 70)}"` : undefined}>
                  <select className={inputCls} value={qCol} onChange={e => setQCol(Number(e.target.value))}>
                    {current.columns.map(c => <option key={c.index} value={c.index}>{c.header}</option>)}
                  </select>
                </Field>
                <Field label="Write answers into">
                  <select className={inputCls} value={aCol} onChange={e => setACol(e.target.value)}>
                    <option value="new">A new &ldquo;Answer&rdquo; column</option>
                    {current.columns.filter(c => c.index !== qCol).map(c => <option key={c.index} value={String(c.index)}>{c.header}</option>)}
                  </select>
                </Field>
              </div>
            )}
            {preview && current && <p className="text-xs text-slate-500">Found about {current.questionCount} questions on &ldquo;{current.name}&rdquo;.</p>}
          </div>
        ) : (
          <Field label="Questions" hint="One per line. Numbering is removed automatically.">
            <textarea className={cx(inputCls, 'h-48 text-xs')} value={text} onChange={e => setText(e.target.value)}
              placeholder={'Do you enforce multi-factor authentication?\nIs customer data encrypted at rest?\nDo you have an incident response plan?'} />
          </Field>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Acme Corp security review" /></Field>
          <Field label="Customer (optional)"><input className={inputCls} value={form.customer} onChange={e => setForm({ ...form, customer: e.target.value })} /></Field>
          <Field label="Due (optional)"><input className={inputCls} type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} /></Field>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end">
          <Button disabled={busy || !form.name.trim() || (mode === 'file' ? !preview : !text.trim())} onClick={create}>
            <Sparkles size={15} /> {busy ? 'Answering…' : 'Create and answer'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// --- Review screen ---------------------------------------------------------------------

const confidenceLabel = (c: number) => (c >= 0.7 ? { label: 'High', cls: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' }
  : c >= 0.45 ? { label: 'Medium', cls: 'text-amber-400 border-amber-500/30 bg-amber-500/10' }
  : { label: 'Low', cls: 'text-red-400 border-red-500/30 bg-red-500/10' });

function QuestionnaireDetail({ id, canEdit, assistant, onBack }: { id: string; canEdit: boolean; assistant: boolean; onBack: () => void }) {
  const [q, setQ] = useState<Detail | null>(null);
  const [filter, setFilter] = useState<'all' | 'needs_input' | 'suggested' | 'approved'>('all');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setQ(await api<Detail>(`/api/questionnaires/${id}`)); } catch (e) { setError((e as Error).message); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function action(body: Record<string, unknown>, done: (r: Record<string, number>) => string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const r = await api<Record<string, number>>(`/api/questionnaires/${id}/answer`, { method: 'POST', json: body });
      setNotice(done(r));
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const items = useMemo(() => (q?.items ?? []).filter(it => filter === 'all' || it.status === filter), [q, filter]);
  if (!q) return <div className="space-y-4"><Button variant="ghost" onClick={onBack}><ArrowLeft size={15} /> Back</Button><ErrorText>{error}</ErrorText></div>;

  const counts = { approved: q.items.filter(i => i.status === 'approved').length, suggested: q.items.filter(i => i.status === 'suggested').length, needs: q.items.filter(i => i.status === 'needs_input').length };
  const confident = q.items.filter(i => i.status === 'suggested' && i.confidence >= 0.7).length;
  const pct = q.items.length ? Math.round((counts.approved / q.items.length) * 100) : 0;

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={15} /> All questionnaires</button>
      <PageHeader
        title={q.name}
        subtitle={<>{q.customer ? `${q.customer} · ` : ''}{q.items.length} questions{q.dueDate ? ` · due ${formatDate(q.dueDate)}` : ''}{q.fileName ? ` · from ${q.fileName}` : ''}</>}
        actions={<>
          <a href={`/api/questionnaires/${id}/export`} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
            <Download size={15} /> Download answered {q.fileName ? 'file' : 'spreadsheet'}
          </a>
          {canEdit && (
            <Button variant="secondary" disabled={busy} onClick={async () => {
              await api(`/api/questionnaires/${id}`, { method: 'PATCH', json: { status: q.status === 'completed' ? 'in_progress' : 'completed' } });
              await load();
            }}>{q.status === 'completed' ? 'Reopen' : <><Check size={15} /> Mark as sent</>}</Button>
          )}
        </>}
      />

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-6">
          <div className="min-w-48 flex-1">
            <div className="flex justify-between text-xs text-slate-400"><span>{counts.approved} approved</span><span>{pct}%</span></div>
            <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="bg-emerald-500" style={{ width: `${(counts.approved / q.items.length) * 100}%` }} />
              <div className="bg-sky-500/60" style={{ width: `${(counts.suggested / q.items.length) * 100}%` }} />
            </div>
            <p className="mt-1.5 text-xs text-slate-500"><span className="text-sky-300">{counts.suggested} suggested</span> · <span className="text-amber-300">{counts.needs} need your input</span></p>
          </div>
          {canEdit && (
            <div className="flex flex-wrap gap-2">
              <Button disabled={busy || !confident} onClick={() => action({ action: 'approve', minConfidence: 0.7 }, r => `Approved ${r.approved} high-confidence answers.`)}>
                <CheckCheck size={15} /> Approve {confident} confident answer{confident === 1 ? '' : 's'}
              </Button>
              <Button variant="secondary" disabled={busy} title="Re-answer unapproved questions from your current data"
                onClick={() => action({ action: 'refresh' }, r => `Re-answered ${r.answered} of ${r.total} open questions from your current data.`)}>
                <RefreshCw size={15} /> Refresh
              </Button>
              {assistant && counts.needs > 0 && (
                <Button variant="secondary" disabled={busy} onClick={() => action({ action: 'assistant' }, r => `The assistant drafted ${r.drafted} answers. Review them before approving.`)}>
                  <Bot size={15} /> Draft the rest
                </Button>
              )}
            </div>
          )}
        </div>
        {notice && <p className="text-sm text-emerald-400">{notice}</p>}
        <ErrorText>{error}</ErrorText>
      </Card>

      <div className="flex flex-wrap gap-2">
        {([['all', `All (${q.items.length})`], ['needs_input', `Needs input (${counts.needs})`], ['suggested', `Suggested (${counts.suggested})`], ['approved', `Approved (${counts.approved})`]] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} className={cx('rounded-lg px-3 py-2 text-sm font-medium', filter === f ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-slate-800')}>{label}</button>
        ))}
      </div>

      <div className="space-y-3">
        {items.map((it, idx) => (
          <ItemCard key={`${it.id}:${it.status}:${it.answer.length}:${it.answer.slice(0, 40)}`} item={it} n={it.position + 1} canEdit={canEdit} questionnaireId={id}
            showSection={!!it.section && it.section !== items[idx - 1]?.section}
            onSaved={updated => setQ(prev => prev && { ...prev, items: prev.items.map(x => (x.id === updated.id ? updated : x)) })} />
        ))}
        {items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Nothing here.</p>}
      </div>
    </div>
  );
}

function ItemCard({ item, n, canEdit, questionnaireId, showSection, onSaved }: {
  item: Item; n: number; canEdit: boolean; questionnaireId: string; showSection: boolean; onSaved: (i: Item) => void;
}) {
  const [text, setText] = useState(item.answer);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);
  const edited = text !== item.answer;
  const conf = confidenceLabel(item.confidence);

  async function save(status: Item['status']) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/questionnaires/${questionnaireId}/items/${item.id}`, { method: 'PATCH', json: { answer: text, status, saveToLibrary: remember } });
      onSaved({ ...item, answer: text, status, confidence: edited ? 1 : item.confidence });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {showSection && <p className="pt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{item.section}</p>}
      <Card className={cx('p-4', item.status === 'approved' && 'border-emerald-500/20')}>
        <div className="flex items-start gap-3">
          <span className="w-8 shrink-0 pt-0.5 text-right font-mono text-xs text-slate-500">{n}</span>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium text-slate-100">{item.question}</p>
            <textarea ref={ref} value={text} disabled={!canEdit} onChange={e => setText(e.target.value)} rows={Math.min(8, Math.max(2, Math.ceil(text.length / 110)))}
              onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); void save('approved'); } }}
              placeholder="Write the answer…" className={cx(inputCls, 'text-sm leading-relaxed')} />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {item.status === 'approved'
                ? <span className="flex items-center gap-1 font-semibold text-emerald-400"><Check size={13} /> Approved{item.approvedBy ? ` by ${item.approvedBy}` : ''}</span>
                : item.source?.type && item.source.type !== 'none' && <span className={cx('rounded-full border px-2 py-0.5 font-semibold', conf.cls)}>{conf.label} confidence</span>}
              {item.source?.type === 'builtin' && <span className="text-slate-500">From your live data{item.source.sources?.length ? `: ${item.source.sources.join(' · ')}` : ''}</span>}
              {item.source?.type === 'library' && <span className="text-slate-500">From your answer library</span>}
              {item.source?.type === 'assistant' && <span className="text-slate-500">Drafted by the assistant; check before approving</span>}
              {item.source?.type === 'none' && !item.answer && <span className="text-amber-300">No matching answer; write one and it will be remembered</span>}
            </div>
            {canEdit && (item.status !== 'approved' || edited) && (
              <div className="flex flex-wrap items-center justify-end gap-3 pt-1">
                {edited && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-400">
                    <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} /> Remember for future questionnaires
                  </label>
                )}
                <span className="hidden text-[11px] text-slate-600 md:inline">Ctrl+Enter to approve</span>
                <Button size="sm" disabled={busy || !text.trim()} onClick={() => save('approved')}><Check size={13} /> Approve</Button>
              </div>
            )}
            <ErrorText>{error}</ErrorText>
          </div>
        </div>
      </Card>
    </>
  );
}

// --- Answer library ---------------------------------------------------------------------

type LibraryData = {
  sample: boolean;
  builtin: { key: string; topic: string; question: string; answer: string; generated: string; short: string | null; confidence: number; sources: string[]; overrideId: string | null; isPublic: boolean; needsInput: boolean }[];
  custom: { id: string; question: string; answer: string; isPublic: boolean; usageCount: number; updatedAt: string; updatedBy: string }[];
};

function AnswerLibrary({ canEdit }: { canEdit: boolean }) {
  const [lib, setLib] = useState<LibraryData | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<{ builtinKey?: string; id?: string; question: string; answer: string; isPublic: boolean } | null>(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => {
    api<LibraryData>('/api/answers').then(setLib).catch(e => setError((e as Error).message));
  }, [version]);

  if (!lib) return <ErrorText>{error}</ErrorText>;
  const s = search.toLowerCase();
  const builtin = lib.builtin.filter(b => !s || `${b.question} ${b.answer} ${b.topic}`.toLowerCase().includes(s));
  const custom = lib.custom.filter(c => !s || `${c.question} ${c.answer}`.toLowerCase().includes(s));
  const topics = [...new Set(builtin.map(b => b.topic))];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-64 flex-1">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input className={cx(inputBase, 'w-full pl-9')} placeholder="Search answers" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {canEdit && <Button variant="secondary" onClick={() => setEditing({ question: '', answer: '', isPublic: false })}><Plus size={15} /> Add an answer</Button>}
      </div>
      <p className="text-sm text-slate-400">
        Built-in answers are written from your live data, so they change as your setup changes{lib.sample ? ' (right now from the sample company)' : ''}. Edit one to use your own wording. Answers you approve in questionnaires are saved here too.
      </p>

      {custom.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Your answers ({custom.length})</h3>
          <Card className="divide-y divide-slate-800">
            {custom.map(c => (
              <div key={c.id} className="space-y-1 p-4">
                <div className="flex items-start gap-3">
                  <p className="flex-1 text-sm font-medium text-slate-100">{c.question}</p>
                  {c.isPublic && <span title="Shown in the Trust Center FAQ"><Globe size={14} className="text-sky-400" /></span>}
                  {canEdit && <button className="text-xs text-sky-400 hover:text-sky-300" onClick={() => setEditing({ id: c.id, question: c.question, answer: c.answer, isPublic: c.isPublic })}>Edit</button>}
                </div>
                <p className="text-sm text-slate-400">{c.answer}</p>
                <p className="text-[11px] text-slate-600">Used {c.usageCount} time{c.usageCount === 1 ? '' : 's'} · updated {formatDate(c.updatedAt)} by {c.updatedBy}</p>
              </div>
            ))}
          </Card>
        </section>
      )}

      {topics.map(t => (
        <section key={t} className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{t}</h3>
          <Card className="divide-y divide-slate-800">
            {builtin.filter(b => b.topic === t).map(b => (
              <div key={b.key} className="space-y-1 p-4">
                <div className="flex items-start gap-3">
                  <p className="flex-1 text-sm font-medium text-slate-100">{b.question}</p>
                  {b.needsInput && <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-300">Needs input</span>}
                  {b.overrideId && <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-300">Your wording</span>}
                  {b.isPublic && <span title="Shown in the Trust Center FAQ"><Globe size={14} className="text-sky-400" /></span>}
                  {canEdit && <button className="text-xs text-sky-400 hover:text-sky-300" onClick={() => setEditing({ builtinKey: b.key, id: b.overrideId ?? undefined, question: b.question, answer: b.answer, isPublic: b.isPublic })}>Edit</button>}
                </div>
                <p className="text-sm text-slate-400">{b.answer}</p>
                {!b.overrideId && <p className="text-[11px] text-slate-600">{b.sources.join(' · ')}</p>}
              </div>
            ))}
          </Card>
        </section>
      ))}

      {editing && (
        <Modal title={editing.builtinKey ? 'Edit answer' : editing.id ? 'Edit your answer' : 'Add an answer'} onClose={() => setEditing(null)} wide>
          <EditAnswer value={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); }}
            generated={editing.builtinKey ? lib.builtin.find(b => b.key === editing.builtinKey)?.generated : undefined} />
        </Modal>
      )}
    </div>
  );
}

function EditAnswer({ value, generated, onClose, onSaved }: {
  value: { builtinKey?: string; id?: string; question: string; answer: string; isPublic: boolean };
  generated?: string; onClose: () => void; onSaved: () => void;
}) {
  const [f, setF] = useState(value);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try { await fn(); onSaved(); } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return (
    <div className="space-y-4">
      {f.builtinKey ? <p className="text-sm font-medium text-slate-200">{f.question}</p> : (
        <Field label="Question"><input className={inputCls} value={f.question} onChange={e => setF({ ...f, question: e.target.value })} /></Field>
      )}
      <Field label="Answer"><textarea className={cx(inputCls, 'h-40 text-sm')} value={f.answer} onChange={e => setF({ ...f, answer: e.target.value })} /></Field>
      {f.builtinKey && <p className="text-xs text-slate-500">Saving replaces the automatically generated answer with your text everywhere it is used. Reset to go back to the generated one.</p>}
      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={f.isPublic} onChange={e => setF({ ...f, isPublic: e.target.checked })} /> Show in the Trust Center FAQ
      </label>
      <ErrorText>{error}</ErrorText>
      <div className="flex justify-between gap-2">
        <div>
          {f.id && <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(() => api(`/api/answers/${f.id}`, { method: 'DELETE' }))}>
            {f.builtinKey ? <><RefreshCw size={13} /> Reset to generated</> : <><Trash2 size={13} /> Delete</>}
          </Button>}
          {f.builtinKey && !f.id && generated && <span className="text-xs text-slate-600">Currently generated from your data.</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !f.answer.trim() || (!f.builtinKey && !f.question.trim())} onClick={() => run(() => f.builtinKey
            ? api('/api/answers', { method: 'POST', json: { builtinKey: f.builtinKey, answer: f.answer, isPublic: f.isPublic } })
            : f.id ? api(`/api/answers/${f.id}`, { method: 'PATCH', json: { question: f.question, answer: f.answer, isPublic: f.isPublic } })
            : api('/api/answers', { method: 'POST', json: { question: f.question, answer: f.answer, isPublic: f.isPublic } }))}>Save</Button>
        </div>
      </div>
    </div>
  );
}
