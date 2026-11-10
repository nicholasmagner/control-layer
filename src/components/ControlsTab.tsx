'use client';

import { ChevronDown, ChevronRight, Download, FileText, Search, Sparkles, Upload } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ControlView } from '@/lib/data';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, ErrorText, formatDate, inputCls, PageHeader, Pill, PROVIDER_LABEL, StatusBadge } from './ui';

const FILTERS = ['All', 'Not Met', 'Partially Met', 'Needs Evidence', 'Met', 'Not Applicable'] as const;

export default function ControlsTab(props: TabProps) {
  const { data, frameworkId, focusControl } = props;
  const fw = data.frameworks.find(f => f.id === frameworkId)!;
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All');
  const [expanded, setExpanded] = useState<string | null>(focusControl ?? null);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const visible = fw.controls.filter(c =>
      (filter === 'All' || c.status === filter || (filter === 'Needs Evidence' && c.status === 'Not assessed')) &&
      (!q || `${c.controlId} ${c.title} ${c.description} ${c.category}`.toLowerCase().includes(q)));
    const map = new Map<string, ControlView[]>();
    for (const c of visible) map.set(c.category, [...(map.get(c.category) ?? []), c]);
    return [...map.entries()];
  }, [fw, query, filter]);

  return (
    <div className="space-y-6">
      <PageHeader title={`${fw.name} controls`} subtitle={`${fw.controls.length} controls · ${fw.version}${fw.coverage === 'preview' ? ' · preview: core requirements only' : ''}`} />

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input className={cx(inputCls, 'pl-9')} placeholder="Search controls" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cx('rounded-lg px-3 py-2 text-xs font-medium', filter === f ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-slate-800')}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {groups.length === 0 && <p className="py-12 text-center text-sm text-slate-500">No controls match.</p>}

      {groups.map(([category, controls]) => (
        <section key={category}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">{category}</h3>
          <Card className="divide-y divide-slate-800 overflow-hidden">
            {controls.map(c => (
              <ControlRow key={c.controlId} control={c} open={expanded === c.controlId}
                onToggle={() => setExpanded(expanded === c.controlId ? null : c.controlId)} {...props} />
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

function ControlRow({ control: c, open, onToggle, data, refresh, openUpload }: TabProps & { control: ControlView; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const canEdit = data.user.role !== 'auditor';
  const [owner, setOwner] = useState(c.owner ?? '');
  const [naReason, setNaReason] = useState(c.naReason ?? '');
  const [showNa, setShowNa] = useState(false);
  const [error, setError] = useState('');
  const [explain, setExplain] = useState<{ loading: boolean; text?: string }>({ loading: false });

  useEffect(() => { if (open) ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [open]);

  async function save(body: Record<string, unknown>) {
    setError('');
    try {
      await api(`/api/controls/${c.id}`, { method: 'PATCH', json: body });
      setShowNa(false);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runExplain() {
    setExplain({ loading: true });
    try {
      const r = await api<{ explanation: string }>('/api/assistant/explain', { method: 'POST', json: { id: c.id } });
      setExplain({ loading: false, text: r.explanation });
    } catch (err) {
      setExplain({ loading: false, text: (err as Error).message });
    }
  }

  return (
    <div ref={ref}>
      <button onClick={onToggle} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-800/30">
        {open ? <ChevronDown size={16} className="shrink-0 text-slate-500" /> : <ChevronRight size={16} className="shrink-0 text-slate-500" />}
        <span className="w-24 shrink-0 font-mono text-xs font-semibold text-sky-400">{c.controlId}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-slate-200">{c.title}</span>
          <span className="block truncate text-xs text-slate-500">{c.justification}</span>
        </span>
        <span className="hidden text-xs text-slate-500 lg:block">{c.evidenceCount} evidence</span>
        <StatusBadge status={c.status} />
      </button>

      {open && (
        <div className="grid gap-6 border-t border-slate-800 bg-slate-950/40 px-5 py-5 lg:grid-cols-2">
          <div className="space-y-5">
            <div>
              <p className="text-sm text-slate-300">{c.description}</p>
              <p className="mt-2 text-xs text-slate-500">
                Status reason: {c.justification}{c.evaluatedAt ? ` (as of ${formatDate(c.evaluatedAt, true)})` : ''}
              </p>
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Automated checks</h4>
              {c.checks.length === 0 ? (
                <p className="text-sm text-slate-500">No automated check covers this control. It is met by uploading current evidence.</p>
              ) : (
                <ul className="space-y-1.5">
                  {c.checks.map(ch => (
                    <li key={ch.id} className="flex items-center gap-2 text-sm">
                      <Pill>{PROVIDER_LABEL[ch.provider]}</Pill>
                      <span className="flex-1 text-slate-300">{ch.title}</span>
                      {!ch.run ? <span className="text-xs text-slate-600">not scanned</span>
                        : ch.failed ? <span className="text-xs font-semibold text-red-400">{ch.failed} failing</span>
                        : <span className="text-xs font-semibold text-emerald-400">{ch.passed} passing</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">What auditors usually ask for</h4>
              <ul className="list-inside list-disc space-y-1 text-sm text-slate-400">
                {c.expectedEvidence.map(e => <li key={e}>{e}</li>)}
              </ul>
              <p className="mt-2 text-xs text-slate-600">Uploaded evidence counts as current for {c.freshnessDays} days.</p>
            </div>
          </div>

          <div className="space-y-5">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Evidence ({c.evidenceCount})</h4>
                {canEdit && c.id && <Button size="sm" variant="secondary" onClick={() => openUpload([c.id])}><Upload size={14} /> Add evidence</Button>}
              </div>
              {c.evidence.length === 0 ? (
                <p className="text-sm text-slate-500">No evidence yet.</p>
              ) : (
                <ul className="space-y-1">
                  {c.evidence.map(e => (
                    <li key={e.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-800/50">
                      <FileText size={14} className="shrink-0 text-slate-500" />
                      <span className="min-w-0 flex-1 truncate text-slate-300">{e.title}</span>
                      <span className="text-xs text-slate-500">{formatDate(e.collectedAt)}</span>
                      <a href={`/api/evidence/${e.id}`} className="text-slate-500 hover:text-sky-400" title="Download"><Download size={14} /></a>
                    </li>
                  ))}
                  {c.evidenceCount > c.evidence.length && <li className="px-2 text-xs text-slate-600">…and {c.evidenceCount - c.evidence.length} more in Evidence &amp; Audits</li>}
                </ul>
              )}
            </div>

            {canEdit && c.id && (
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">Ownership and scope</h4>
                <div className="flex gap-2">
                  <input className={inputCls} placeholder="Control owner (name or team)" value={owner} onChange={e => setOwner(e.target.value)} />
                  <Button size="sm" variant="secondary" disabled={owner === (c.owner ?? '')} onClick={() => save({ owner })}>Save</Button>
                </div>
                {c.applicable ? (
                  showNa ? (
                    <div className="space-y-2">
                      <textarea className={inputCls} rows={2} placeholder="Why is this control out of scope? Auditors will read this."
                        value={naReason} onChange={e => setNaReason(e.target.value)} />
                      <div className="flex gap-2">
                        <Button size="sm" variant="secondary" onClick={() => setShowNa(false)}>Cancel</Button>
                        <Button size="sm" disabled={!naReason.trim()} onClick={() => save({ applicable: false, naReason })}>Mark not applicable</Button>
                      </div>
                    </div>
                  ) : (
                    <button className="text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline" onClick={() => setShowNa(true)}>
                      Mark as not applicable…
                    </button>
                  )
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => save({ applicable: true })}>Bring back into scope</Button>
                )}
                <ErrorText>{error}</ErrorText>
              </div>
            )}
            {!canEdit && c.owner && <p className="text-sm text-slate-400">Owner: {c.owner}</p>}

            {data.features.assistant && c.id && (
              <div>
                <Button size="sm" variant="ghost" onClick={runExplain} disabled={explain.loading}>
                  <Sparkles size={14} /> {explain.loading ? 'Thinking…' : 'Explain and suggest next steps'}
                </Button>
                {explain.text && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-900 p-3 text-sm leading-relaxed text-slate-300">{explain.text}</p>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
