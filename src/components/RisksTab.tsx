'use client';

import { AlertTriangle, ArrowRight, Check, CheckCircle2, ClipboardCheck, Lightbulb, Plus, Search, ShieldAlert, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RiskView } from '@/risks/service';
import { IMPACT, IMPACT_HELP, level, LIKELIHOOD, LIKELIHOOD_HELP } from '@/risks/score';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatDate, inputBase, inputCls, Modal, PageHeader, StatusBadge } from './ui';

const LEVEL_STYLE: Record<string, string> = {
  critical: 'bg-red-600/80 text-white', high: 'bg-orange-500/70 text-white', medium: 'bg-amber-400/70 text-slate-950', low: 'bg-emerald-600/60 text-white',
};
const LEVEL_TEXT: Record<string, string> = { critical: 'text-red-300', high: 'text-orange-300', medium: 'text-amber-300', low: 'text-emerald-300' };
const TREATMENT: Record<string, string> = { mitigate: 'Mitigate', accept: 'Accept', transfer: 'Transfer', avoid: 'Avoid' };
const STATUS: Record<string, string> = { open: 'Open', treating: 'Being treated', accepted: 'Accepted', closed: 'Closed' };
const CATEGORIES = ['Security', 'Operational', 'Compliance', 'Vendor', 'AI', 'Financial'];

function ScorePill({ score }: { score: number }) {
  const l = level(score);
  return <span className={cx('inline-flex min-w-9 justify-center rounded px-1.5 py-0.5 text-xs font-bold', LEVEL_STYLE[l])} title={l}>{score}</span>;
}

export default function RisksTab({ data, refresh }: TabProps) {
  const { risks, library, lastAssessment, nextAssessmentDue } = data.risks;
  const canEdit = data.user.role !== 'auditor';
  const isAdmin = data.user.role === 'admin';
  const [view, setView] = useState<'residual' | 'inherent'>('residual');
  const [cellFilter, setCellFilter] = useState<{ l: number; i: number } | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const controlStatus = useMemo(() => {
    const m = new Map<string, string>();
    for (const fw of data.frameworks) for (const c of fw.controls) m.set(`${fw.id}:${c.controlId}`, c.status);
    return m;
  }, [data.frameworks]);

  const active = risks.filter(r => r.status !== 'closed');
  const coords = (r: RiskView) => (view === 'residual' ? { l: r.residualLikelihood ?? r.likelihood, i: r.residualImpact ?? r.impact } : { l: r.likelihood, i: r.impact });
  const list = risks.filter(r => (showClosed ? true : r.status !== 'closed'))
    .filter(r => !cellFilter || (coords(r).l === cellFilter.l && coords(r).i === cellFilter.i))
    .sort((a, b) => b.residualScore - a.residualScore || b.score - a.score);
  const suggested = library.filter(l => !l.added && l.reasons.length);
  const open = risks.find(r => r.id === openId) ?? null;
  const due = nextAssessmentDue && new Date(nextAssessmentDue) < new Date();

  async function run(fn: () => Promise<string | void>) {
    setBusy(true); setError(''); setNotice('');
    try { const m = await fn(); if (m) setNotice(m); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Risk register"
        subtitle="What could go wrong, how likely and how bad it would be, and what you're doing about it. Linked controls show whether the treatment is actually working."
        actions={canEdit && <>
          {active.length > 0 && <Button variant="secondary" disabled={busy} onClick={() => run(async () => { await api('/api/risks/assessment', { method: 'POST' }); return 'Risk assessment completed and saved as audit evidence.'; })}>
            <ClipboardCheck size={15} /> Complete risk assessment
          </Button>}
          <Button onClick={() => setAdding(true)}><Plus size={15} /> Add risk</Button>
        </>}
      />
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}
      <ErrorText>{error}</ErrorText>

      <Card className={cx('flex flex-wrap items-center gap-4 p-5', due || !lastAssessment ? 'border-amber-500/30' : 'border-emerald-500/20')}>
        <ShieldAlert className={due || !lastAssessment ? 'text-amber-400' : 'text-emerald-400'} />
        <p className="flex-1 text-sm text-slate-200">
          {!lastAssessment ? 'No risk assessment completed yet. Auditors (SOC 2, ISO 27001, HIPAA) expect one at least yearly: review every risk, then click "Complete risk assessment".'
            : due ? <>The yearly risk assessment was due {formatDate(nextAssessmentDue)}. Last completed {formatDate(lastAssessment.completedAt)} by {lastAssessment.completedBy}.</>
            : <>Last risk assessment {formatDate(lastAssessment.completedAt)} by {lastAssessment.completedBy}. Next due by <strong>{formatDate(nextAssessmentDue)}</strong>.</>}
        </p>
      </Card>

      {canEdit && suggested.length > 0 && (
        <Card className="space-y-3 border-sky-500/30 bg-sky-500/5 p-5">
          <div className="flex flex-wrap items-center gap-3">
            <Lightbulb size={18} className="text-sky-400" />
            <p className="flex-1 text-sm font-medium text-slate-200">Suggested from your checks, vendors and frameworks</p>
            <Button size="sm" disabled={busy} onClick={() => run(async () => { const r = await api<{ added: number }>('/api/risks', { method: 'POST', json: { library: suggested.map(s => s.key) } }); return `Added ${r.added} risks.`; })}>Add all {suggested.length}</Button>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {suggested.map(s => (
              <li key={s.key} className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-200">{s.title}</p>
                  <p className="text-xs text-sky-300">Because {s.reasons.join(' and ')}</p>
                </div>
                <button disabled={busy} className="text-xs text-sky-400 hover:text-sky-300" onClick={() => run(async () => { await api('/api/risks', { method: 'POST', json: { library: [s.key] } }); })}>Add</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {risks.length === 0 ? (
        <Card className="p-8">
          <Empty icon={ShieldAlert} title="No risks yet">
            Start from {library.length} common risks for small companies (security, operations, vendors, compliance and AI), each with suggested ratings, a treatment plan and linked controls.
            {canEdit && <div className="mt-4"><Button onClick={() => setAdding(true)}><Plus size={15} /> Add risks</Button></div>}
          </Empty>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-5">
          <Card className="space-y-4 p-5 xl:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-100">Heat map</h3>
              <div className="flex gap-1 rounded-lg bg-slate-950 p-1 text-xs">
                {(['residual', 'inherent'] as const).map(v => (
                  <button key={v} onClick={() => { setView(v); setCellFilter(null); }} className={cx('rounded-md px-2.5 py-1', view === v ? 'bg-slate-800 font-medium text-slate-100' : 'text-slate-400')}>
                    {v === 'residual' ? 'After controls' : 'Before controls'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex w-5 items-center justify-center"><span className="-rotate-90 whitespace-nowrap text-[10px] uppercase tracking-wider text-slate-500">Likelihood</span></div>
              <div className="flex-1">
                <div className="grid grid-cols-5 gap-1">
                  {[5, 4, 3, 2, 1].flatMap(l => [1, 2, 3, 4, 5].map(i => {
                    const n = active.filter(r => coords(r).l === l && coords(r).i === i).length;
                    const sel = cellFilter?.l === l && cellFilter?.i === i;
                    return (
                      <button key={`${l}${i}`} title={`${LIKELIHOOD[l]} × ${IMPACT[i]}`} onClick={() => setCellFilter(sel ? null : { l, i })}
                        className={cx('flex aspect-square items-center justify-center rounded text-sm font-bold transition-opacity', LEVEL_STYLE[level(l * i)],
                          n ? 'opacity-100' : 'opacity-25', sel && 'ring-2 ring-sky-400 ring-offset-2 ring-offset-slate-900')}>
                        {n || ''}
                      </button>
                    );
                  }))}
                </div>
                <p className="mt-2 text-center text-[10px] uppercase tracking-wider text-slate-500">Impact</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {(['critical', 'high', 'medium', 'low'] as const).map(lv => (
                <div key={lv} className="rounded bg-slate-950/60 py-2">
                  <p className={cx('text-lg font-bold', LEVEL_TEXT[lv])}>{active.filter(r => (view === 'residual' ? r.residualLevel : r.level) === lv).length}</p>
                  <p className="capitalize text-slate-500">{lv}</p>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-3 xl:col-span-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">{cellFilter ? <>Showing {LIKELIHOOD[cellFilter.l].toLowerCase()} × {IMPACT[cellFilter.i].toLowerCase()} <button className="ml-1 text-sky-400" onClick={() => setCellFilter(null)}><X size={12} className="inline" /> clear</button></> : `${active.length} open risks`}</span>
              <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} /> Show closed</label>
            </div>
            <Card className="divide-y divide-slate-800">
              {list.map(r => {
                const met = r.controls.filter(k => controlStatus.get(k) === 'Met').length;
                return (
                  <button key={r.id} onClick={() => setOpenId(r.id)} className="flex w-full flex-col gap-2 px-4 py-3 text-left hover:bg-slate-800/40">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-100">{r.title}</p>
                        <p className="text-xs text-slate-500">{r.category} · {r.owner ?? 'no owner'} · {STATUS[r.status]}{r.status !== 'accepted' ? ` · ${TREATMENT[r.treatment]}` : r.acceptedUntil ? ` until ${formatDate(r.acceptedUntil)}` : ''}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5"><ScorePill score={r.score} /><ArrowRight size={12} className="text-slate-600" /><ScorePill score={r.residualScore} /></div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {r.controls.length > 0 && <span className={cx('rounded px-1.5 py-0.5 text-[11px]', met === r.controls.length ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-300')}>{met}/{r.controls.length} controls met</span>}
                      {r.signals.map(s => <span key={s.id} className={cx('rounded px-1.5 py-0.5 text-[11px]', s.level === 'high' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300')}>{s.text}</span>)}
                    </div>
                  </button>
                );
              })}
              {list.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing here.</p>}
            </Card>
          </div>
        </div>
      )}

      {adding && <AddRisk library={library} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); refresh(); }} />}
      {open && <RiskDetail risk={open} canEdit={canEdit} isAdmin={isAdmin} controlStatus={controlStatus} frameworks={data.frameworks.filter(f => data.settings.frameworks.includes(f.id))} onClose={() => setOpenId(null)} refresh={refresh} />}
    </div>
  );
}

function AddRisk({ library, onClose, onAdded }: { library: TabProps['data']['risks']['library']; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState({ title: '', description: '', category: 'Security', likelihood: 3, impact: 3 });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const avail = library.filter(l => !l.added && (!q || `${l.title} ${l.category} ${l.description}`.toLowerCase().includes(q.toLowerCase())));
  const cats = [...new Set(avail.map(l => l.category))];

  if (custom) {
    return (
      <Modal title="Add a risk" onClose={onClose} wide>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="md:col-span-2"><Field label="Risk"><input className={inputCls} autoFocus value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Our only database administrator leaves" /></Field></div>
            <Field label="Category"><select className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
          </div>
          <Field label="Description (optional)"><textarea className={cx(inputCls, 'h-20')} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
          <RatingPicker likelihood={form.likelihood} impact={form.impact} onChange={(l, i) => setForm({ ...form, likelihood: l, impact: i })} />
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setCustom(false)}>Back to the library</Button>
            <Button disabled={busy || !form.title.trim()} onClick={async () => {
              setBusy(true);
              try { await api('/api/risks', { method: 'POST', json: form }); onAdded(); } catch (e) { setError((e as Error).message); setBusy(false); }
            }}>Add risk</Button>
          </div>
        </div>
      </Modal>
    );
  }
  return (
    <Modal title="Add risks" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
          <input className={cx(inputCls, 'pl-9')} autoFocus placeholder="Search the risk library" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          {cats.map(c => (
            <div key={c} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{c}</p>
              {avail.filter(l => l.category === c).map(l => (
                <label key={l.key} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-800/50">
                  <input type="checkbox" className="mt-1" checked={chosen.includes(l.key)} onChange={e => setChosen(e.target.checked ? [...chosen, l.key] : chosen.filter(x => x !== l.key))} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm text-slate-200">{l.title} <ScorePill score={l.likelihood * l.impact} /></span>
                    <span className="block text-xs text-slate-500">{l.description}</span>
                    {l.reasons.length > 0 && <span className="block text-xs text-sky-300">Suggested because {l.reasons.join(' and ')}</span>}
                  </span>
                </label>
              ))}
            </div>
          ))}
          {!avail.length && <p className="text-sm text-slate-500">Every library risk has been added.</p>}
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-between">
          <Button variant="ghost" onClick={() => setCustom(true)}>Write your own</Button>
          <Button disabled={busy || !chosen.length} onClick={async () => {
            setBusy(true);
            try { await api('/api/risks', { method: 'POST', json: { library: chosen } }); onAdded(); } catch (e) { setError((e as Error).message); setBusy(false); }
          }}>Add {chosen.length || ''} risk{chosen.length === 1 ? '' : 's'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function RatingPicker({ likelihood, impact, onChange, label }: { likelihood: number; impact: number; onChange: (l: number, i: number) => void; label?: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <Field label={`${label ?? ''}Likelihood`} hint={LIKELIHOOD_HELP[likelihood]}>
        <select className={inputCls} value={likelihood} onChange={e => onChange(Number(e.target.value), impact)}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} – {LIKELIHOOD[n]}</option>)}
        </select>
      </Field>
      <Field label={`${label ?? ''}Impact`} hint={IMPACT_HELP[impact]}>
        <select className={inputCls} value={impact} onChange={e => onChange(likelihood, Number(e.target.value))}>
          {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} – {IMPACT[n]}</option>)}
        </select>
      </Field>
    </div>
  );
}

function RiskDetail({ risk: r, canEdit, isAdmin, controlStatus, frameworks, onClose, refresh }: {
  risk: RiskView; canEdit: boolean; isAdmin: boolean; controlStatus: Map<string, string>;
  frameworks: TabProps['data']['frameworks']; onClose: () => void; refresh: () => void;
}) {
  const init = {
    title: r.title, description: r.description ?? '', category: r.category, owner: r.owner ?? '', likelihood: r.likelihood, impact: r.impact,
    residualLikelihood: r.residualLikelihood ?? r.likelihood, residualImpact: r.residualImpact ?? r.impact, treatment: r.treatment,
    treatmentPlan: r.treatmentPlan ?? '', controls: r.controls, dueDate: r.dueDate?.slice(0, 10) ?? '',
  };
  const [f, setF] = useState(init);
  const [addCtl, setAddCtl] = useState('');
  const [accepting, setAccepting] = useState(false);
  const [reason, setReason] = useState('');
  const [until, setUntil] = useState(new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);
  const ctlOptions = useMemo(() => frameworks.flatMap(fw => fw.controls.map(c => ({ key: `${fw.id}:${c.controlId}`, label: `${fw.shortName} ${c.controlId} – ${c.title}` }))), [frameworks]);
  const ctlLabel = (k: string) => ctlOptions.find(o => o.key === k)?.label ?? k.replace(':', ' ');

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    setBusy(true); setError('');
    try { await fn(); setSaved(true); refresh(); after?.(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  const save = (extra: Record<string, unknown> = {}) => run(() => api(`/api/risks/${r.id}`, { method: 'PATCH', json: { ...f, ...extra } }));
  const dis = !canEdit;

  return (
    <Modal title={r.title} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400">Before controls</span><ScorePill score={f.likelihood * f.impact} />
          <ArrowRight size={12} className="text-slate-600" />
          <span className="text-slate-400">after</span><ScorePill score={f.residualLikelihood * f.residualImpact} />
          <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-slate-300">{STATUS[r.status]}</span>
          {r.reviewedAt && <span className="text-slate-500">Reviewed {formatDate(r.reviewedAt)}</span>}
        </div>
        {r.signals.length > 0 && (
          <ul className="space-y-1">{r.signals.map(s => <li key={s.id} className="flex items-center gap-2 text-sm text-slate-300"><AlertTriangle size={14} className={s.level === 'high' ? 'text-red-400' : 'text-amber-400'} /> {s.text}</li>)}</ul>
        )}
        {r.failing.length > 0 && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-200">
            Failing now: {r.failing.map(x => `${x.title} (${x.failed})`).join(' · ')}
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2"><Field label="Risk"><input className={inputCls} disabled={dis} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></Field></div>
          <Field label="Category"><select className={inputCls} disabled={dis} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></Field>
        </div>
        <Field label="Description"><textarea className={cx(inputCls, 'h-16')} disabled={dis} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Owner"><input className={inputCls} disabled={dis} value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} placeholder="name@company.com" /></Field>
          <Field label="Treatment due"><input type="date" className={inputCls} disabled={dis} value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} /></Field>
        </div>
        <p className="text-sm font-medium text-slate-300">Before controls (inherent)</p>
        <RatingPicker likelihood={f.likelihood} impact={f.impact} onChange={(l, i) => setF({ ...f, likelihood: l, impact: i })} />
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Treatment">
            <select className={inputCls} disabled={dis || r.status === 'accepted'} value={f.treatment} onChange={e => setF({ ...f, treatment: e.target.value })}>
              <option value="mitigate">Mitigate: add controls</option><option value="transfer">Transfer: insurance or contract</option><option value="avoid">Avoid: stop the activity</option>
              {r.status === 'accepted' && <option value="accept">Accept</option>}
            </select>
          </Field>
        </div>
        <Field label="Treatment plan"><textarea className={cx(inputCls, 'h-20')} disabled={dis} value={f.treatmentPlan} onChange={e => setF({ ...f, treatmentPlan: e.target.value })} /></Field>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">Controls that reduce this risk</p>
          {f.controls.length ? (
            <ul className="space-y-1">
              {f.controls.map(k => (
                <li key={k} className="flex items-center gap-2 text-sm">
                  <StatusBadge status={controlStatus.get(k) ?? 'Not assessed'} />
                  <span className="flex-1 truncate text-slate-300">{ctlLabel(k)}</span>
                  {canEdit && <button className="text-slate-500 hover:text-red-300" onClick={() => setF({ ...f, controls: f.controls.filter(x => x !== k) })}><X size={14} /></button>}
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-slate-500">No controls linked yet.</p>}
          {canEdit && (
            <div className="flex gap-2">
              <input className={cx(inputBase, 'flex-1')} list={`ctl-${r.id}`} value={addCtl} onChange={e => setAddCtl(e.target.value)} placeholder="Link a control (type to search)" />
              <datalist id={`ctl-${r.id}`}>{ctlOptions.map(o => <option key={o.key} value={o.label} />)}</datalist>
              <Button size="sm" variant="secondary" disabled={!ctlOptions.some(o => o.label === addCtl)} onClick={() => {
                const o = ctlOptions.find(x => x.label === addCtl);
                if (o && !f.controls.includes(o.key)) setF({ ...f, controls: [...f.controls, o.key] });
                setAddCtl('');
              }}>Link</Button>
            </div>
          )}
        </div>

        <p className="text-sm font-medium text-slate-300">After controls (residual)</p>
        <RatingPicker likelihood={f.residualLikelihood} impact={f.residualImpact} onChange={(l, i) => setF({ ...f, residualLikelihood: l, residualImpact: i })} />

        {r.status === 'accepted' && (
          <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-300">
            Accepted by {r.acceptedBy} until {formatDate(r.acceptedUntil)}: {r.acceptedReason}
          </div>
        )}
        {accepting && (
          <div className="space-y-3 rounded-lg border border-amber-500/30 p-4">
            <p className="text-sm text-slate-200">Accepting a risk means leadership knowingly decides not to reduce it further, for now. It is recorded with your name and reviewed again by the date below.</p>
            <Field label="Why is this risk acceptable?"><textarea className={cx(inputCls, 'h-20')} value={reason} onChange={e => setReason(e.target.value)} /></Field>
            <Field label="Review again by"><input type="date" className={inputCls} value={until} onChange={e => setUntil(e.target.value)} /></Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAccepting(false)}>Cancel</Button>
              <Button disabled={busy || reason.trim().length < 10} onClick={() => run(async () => { if (dirty) await api(`/api/risks/${r.id}`, { method: 'PATCH', json: f }); await api(`/api/risks/${r.id}/accept`, { method: 'POST', json: { reason, until } }); }, () => setAccepting(false))}>Accept risk</Button>
            </div>
          </div>
        )}
        <ErrorText>{error}</ErrorText>
        {canEdit && !accepting && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap gap-2">
              {isAdmin && r.status !== 'accepted' && r.status !== 'closed' && <Button size="sm" variant="ghost" onClick={() => setAccepting(true)}>Accept risk…</Button>}
              {r.status !== 'closed'
                ? <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ status: 'closed' })}><CheckCircle2 size={13} /> Close (no longer applies)</Button>
                : <Button size="sm" variant="ghost" disabled={busy} onClick={() => save({ status: 'open' })}>Reopen</Button>}
              {isAdmin && <Button size="sm" variant="ghost" disabled={busy} onClick={async () => { if (confirm('Delete this risk? Closing it keeps the history.')) { await api(`/api/risks/${r.id}`, { method: 'DELETE' }); refresh(); onClose(); } }}><Trash2 size={13} /> Delete</Button>}
            </div>
            <div className="flex items-center gap-3">
              {saved && !dirty && <span className="flex items-center gap-1 text-sm text-emerald-400"><Check size={14} /> Saved</span>}
              {r.status === 'open' && f.treatmentPlan.trim() && <Button size="sm" variant="secondary" disabled={busy} onClick={() => save({ status: 'treating' })}>Mark as being treated</Button>}
              <Button disabled={busy || !dirty} onClick={() => save()}>Save</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
