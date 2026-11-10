'use client';

import { AlertCircle, CheckCircle2, Download, FileText, Plus, Send } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PolicyView } from '@/policies/service';
import { renderMarkdown } from '@/policies/markdown';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatDate, inputCls, Modal, PageHeader, Pill } from './ui';

function policyStatus(p: PolicyView): { label: string; cls: string } {
  if (!p.latest) return { label: 'Draft', cls: 'bg-slate-500/10 text-slate-300 border-slate-500/25' };
  if (p.overdue) return { label: 'Review overdue', cls: 'bg-red-500/10 text-red-400 border-red-500/25' };
  if (p.unpublishedChanges) return { label: `v${p.latest.version} · unpublished edits`, cls: 'bg-amber-500/10 text-amber-400 border-amber-500/25' };
  return { label: `Published v${p.latest.version}`, cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' };
}

export default function PoliciesTab({ data, refresh, navigate }: TabProps) {
  const { policies, templates, people } = data.policies;
  const canEdit = data.user.role !== 'auditor';
  const [editing, setEditing] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const published = policies.filter(p => p.latest);
  const signoff = published.filter(p => p.requiresSignoff);
  const activePeople = people.filter(p => p.active);
  const needed = signoff.length * activePeople.length;
  const done = signoff.reduce((n, p) => n + p.accepted, 0);
  const editingPolicy = policies.find(p => p.id === editing) ?? null;

  async function addAll() {
    setBusy(true);
    setError('');
    try {
      await api('/api/policies', { method: 'POST', json: { templates: 'all' } });
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Policies"
        subtitle="Start from ready-made templates, edit them to fit, publish, and collect sign-off from everyone. Published versions are saved as evidence automatically."
        actions={<>
          <a href={`/api/policies/report?${new URLSearchParams({ format: "csv" })}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">
            <Download size={15} /> Sign-off report
          </a>
          {canEdit && policies.length > 0 && <Button variant="secondary" onClick={() => setPicking(true)}><Plus size={15} /> Add policy</Button>}
        </>}
      />
      <ErrorText>{error}</ErrorText>

      {policies.length === 0 ? (
        <Card className="p-8">
          <Empty icon={FileText} title="No policies yet">
            <p>Auditors expect written, approved policies that everyone has accepted. Add {templates.length} templates written for small companies (information security, acceptable use, access control, incident response and more), then edit and publish them.</p>
            {canEdit && (
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button onClick={addAll} disabled={busy}>{busy ? 'Adding…' : `Add all ${templates.length} templates`}</Button>
                <Button variant="secondary" onClick={() => setPicking(true)}>Choose templates</Button>
              </div>
            )}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat label="Published" value={`${published.length} of ${policies.length}`} hint={published.length < policies.length ? 'Drafts don\'t count as evidence until published.' : 'All policies are published.'} />
            <Stat label="Sign-off" value={needed ? `${Math.round((done / needed) * 100)}%` : '—'}
              hint={needed ? `${done} of ${needed} acceptances from ${activePeople.length} ${activePeople.length === 1 ? 'person' : 'people'}` : activePeople.length ? 'Publish a policy that needs sign-off.' : 'Add people to collect sign-off.'}
              action={activePeople.length === 0 ? { label: 'Add people', onClick: () => navigate('people') } : needed > done ? { label: 'Send links', onClick: () => navigate('people') } : undefined} />
            <Stat label="Reviews due" value={String(policies.filter(p => p.overdue).length)} hint="Each policy must be reviewed and re-published on schedule (usually yearly)." />
          </div>

          <Card className="divide-y divide-slate-800">
            {policies.map(p => {
              const st = policyStatus(p);
              return (
                <button key={p.id} onClick={() => setEditing(p.id)} className="flex w-full flex-col gap-2 px-5 py-4 text-left hover:bg-slate-800/40 md:flex-row md:items-center md:gap-4">
                  <FileText size={18} className="hidden shrink-0 text-sky-400 md:block" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-100">{p.title}</p>
                    <p className="truncate text-xs text-slate-500">{p.summary || 'No summary'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {p.latest && p.requiresSignoff && (
                      <span className={cx('font-medium', p.required && p.accepted >= p.required ? 'text-emerald-400' : 'text-slate-400')}>
                        {p.accepted}/{p.required} signed
                      </span>
                    )}
                    {p.reviewDue && <span className="text-slate-500">Review by {formatDate(p.reviewDue)}</span>}
                    <span className={cx('rounded-full border px-2.5 py-0.5 font-semibold', st.cls)}>{st.label}</span>
                  </div>
                </button>
              );
            })}
          </Card>
        </>
      )}

      {picking && <TemplatePicker templates={templates} onClose={() => setPicking(false)} onNew={() => { setPicking(false); setCreating(true); }}
        onDone={() => { setPicking(false); refresh(); }} />}
      {creating && <NewPolicy onClose={() => setCreating(false)} onDone={id => { setCreating(false); refresh(); setEditing(id); }} />}
      {editingPolicy && <PolicyEditor policy={editingPolicy} canEdit={canEdit} isAdmin={data.user.role === 'admin'}
        onClose={() => setEditing(null)} refresh={refresh} />}
    </div>
  );
}

function Stat({ label, value, hint, action }: { label: string; value: string; hint: string; action?: { label: string; onClick: () => void } }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-100">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
      {action && <button onClick={action.onClick} className="mt-2 text-xs font-medium text-sky-400 hover:text-sky-300">{action.label} →</button>}
    </Card>
  );
}

function TemplatePicker({ templates, onClose, onDone, onNew }: {
  templates: TabProps['data']['policies']['templates'];
  onClose: () => void;
  onDone: () => void;
  onNew: () => void;
}) {
  const available = templates.filter(t => !t.adopted);
  const [chosen, setChosen] = useState<Set<string>>(new Set(available.map(t => t.slug)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    setBusy(true);
    try {
      await api('/api/policies', { method: 'POST', json: { templates: [...chosen] } });
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Add policies" onClose={onClose} wide>
      <div className="space-y-4">
        {available.length === 0 ? <p className="text-sm text-slate-400">Every template has been added.</p> : (
          <div className="max-h-[50vh] space-y-1 overflow-y-auto">
            {available.map(t => (
              <label key={t.slug} className="flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 hover:bg-slate-800/50">
                <input type="checkbox" className="mt-1" checked={chosen.has(t.slug)} onChange={e => {
                  const next = new Set(chosen);
                  if (e.target.checked) next.add(t.slug); else next.delete(t.slug);
                  setChosen(next);
                }} />
                <span>
                  <span className="block text-sm font-medium text-slate-200">{t.title}</span>
                  <span className="block text-xs text-slate-500">{t.summary}</span>
                </span>
              </label>
            ))}
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex flex-wrap justify-between gap-2">
          <Button variant="ghost" onClick={onNew}><Plus size={15} /> Blank policy</Button>
          <Button onClick={add} disabled={busy || chosen.size === 0}>{busy ? 'Adding…' : `Add ${chosen.size} ${chosen.size === 1 ? 'policy' : 'policies'}`}</Button>
        </div>
      </div>
    </Modal>
  );
}

function NewPolicy({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  return (
    <Modal title="New policy" onClose={onClose}>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        try {
          const res = await api<{ id: string }>('/api/policies', { method: 'POST', json: { title } });
          onDone(res.id);
        } catch (err) {
          setError((err as Error).message);
        }
      }}>
        <Field label="Title"><input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Remote Work Policy" autoFocus /></Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end"><Button type="submit" disabled={!title.trim()}>Create</Button></div>
      </form>
    </Modal>
  );
}

function PolicyEditor({ policy, canEdit, isAdmin, onClose, refresh }: {
  policy: PolicyView;
  canEdit: boolean;
  isAdmin: boolean;
  onClose: () => void;
  refresh: () => void;
}) {
  const [mode, setMode] = useState<'read' | 'edit'>(policy.latest || !canEdit ? 'read' : 'edit');
  const [form, setForm] = useState({
    title: policy.title, summary: policy.summary, draft: policy.draft, owner: policy.owner ?? '',
    reviewIntervalDays: policy.reviewIntervalDays, requiresSignoff: policy.requiresSignoff,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const dirty = form.title !== policy.title || form.summary !== policy.summary || form.draft !== policy.draft
    || form.owner !== (policy.owner ?? '') || form.reviewIntervalDays !== policy.reviewIntervalDays || form.requiresSignoff !== policy.requiresSignoff;
  const shown = mode === 'read' && policy.latest && !dirty ? policy.latest.content : form.draft.replaceAll('{{effective_date}}', '(set when published)');
  const html = useMemo(() => renderMarkdown(shown), [shown]);
  const st = policyStatus(policy);

  async function run(fn: () => Promise<unknown>, done?: string) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      if (done) setNotice(done);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const save = () => api(`/api/policies/${policy.id}`, { method: 'PATCH', json: form });

  return (
    <Modal title={policy.title} onClose={() => { if (!dirty || confirm('Discard unsaved changes?')) onClose(); }} wide>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={cx('rounded-full border px-2.5 py-0.5 font-semibold', st.cls)}>{st.label}</span>
          {policy.latest && <span className="text-slate-500">Published {formatDate(policy.latest.publishedAt)} by {policy.latest.publishedBy}</span>}
          {policy.controls.map(c => <Pill key={c}>{c.replace(':', ' ')}</Pill>)}
        </div>

        {canEdit && (
          <div className="flex gap-1 rounded-lg bg-slate-950 p-1 text-sm">
            {(['read', 'edit'] as const).map(m => (
              <button key={m} onClick={() => setMode(m)} className={cx('flex-1 rounded-md py-1.5', mode === m ? 'bg-slate-800 font-medium text-slate-100' : 'text-slate-400')}>
                {m === 'read' ? (policy.latest && !dirty ? 'Published version' : 'Preview') : 'Edit'}
              </button>
            ))}
          </div>
        )}

        {mode === 'read' ? (
          <div className="policy-doc max-h-[55vh] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/50 p-5" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Title"><input className={inputCls} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></Field>
              <Field label="Owner" hint="Who maintains this policy."><input className={inputCls} value={form.owner} onChange={e => setForm({ ...form, owner: e.target.value })} placeholder="e.g. Jane Smith, CTO" /></Field>
            </div>
            <Field label="Summary"><input className={inputCls} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} /></Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Review every">
                <select className={inputCls} value={form.reviewIntervalDays} onChange={e => setForm({ ...form, reviewIntervalDays: Number(e.target.value) })}>
                  <option value={90}>3 months</option><option value={180}>6 months</option><option value={365}>Year</option><option value={730}>2 years</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 pt-7 text-sm text-slate-300">
                <input type="checkbox" checked={form.requiresSignoff} onChange={e => setForm({ ...form, requiresSignoff: e.target.checked })} />
                Everyone must read and accept this policy
              </label>
            </div>
            <Field label="Policy text" hint="Markdown: # headings, - lists, **bold**, | tables |. {{effective_date}} is filled in when you publish.">
              <textarea className={cx(inputCls, 'h-[40vh] font-mono text-xs leading-relaxed')} value={form.draft} onChange={e => setForm({ ...form, draft: e.target.value })} spellCheck />
            </Field>
          </div>
        )}

        <ErrorText>{error}</ErrorText>
        {notice && <p className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 size={15} /> {notice}</p>}
        {policy.latest && policy.unpublishedChanges && !dirty && (
          <p className="flex items-center gap-2 text-xs text-amber-300"><AlertCircle size={14} /> The draft has edits that aren&apos;t published yet.</p>
        )}

        {canEdit && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
            <div>
              {isAdmin && (
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => {
                  if (confirm(`Remove "${policy.title}"? Published versions stay in the evidence library.`)) {
                    void run(() => api(`/api/policies/${policy.id}`, { method: 'DELETE' })).then(onClose);
                  }
                }}>Remove</Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {dirty && <Button variant="secondary" disabled={busy} onClick={() => run(save, 'Draft saved.')}>Save draft</Button>}
              <Button disabled={busy || (!dirty && !policy.unpublishedChanges)} onClick={() => run(async () => {
                if (dirty) await save();
                await api(`/api/policies/${policy.id}/publish`, { method: 'POST' });
                setMode('read');
              }, form.requiresSignoff ? 'Published. Send sign-off links from the People page.' : 'Published and saved as evidence.')}>
                <Send size={15} /> {policy.latest ? 'Publish new version' : 'Publish'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
