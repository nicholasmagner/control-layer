'use client';

import { ArrowLeft, Check, CheckCircle2, CircleDot, Clock, KeyRound, Pencil, Play, Trash2, UserCheck, UserX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatDate, inputCls, Modal, PageHeader } from './ui';

type Item = {
  id: string; provider: string; system: string; accountId: string; name: string; email: string | null; isAdmin: boolean; lastActivity: string | null;
  detail: string | null; flags: string[]; personName: string | null; decision: 'pending' | 'keep' | 'remove' | 'change'; note: string | null;
  decidedBy: string | null; decidedAt: string | null; removal: 'removed' | 'still_active' | 'not_rescanned' | null;
};
type Review = { id: string; name: string; status: string; dueDate: string | null; systems: string[]; createdAt: string; createdBy: string; completedAt: string | null; completedBy: string | null; evidenceId: string | null; items: Item[] };

const FLAG_LABEL: Record<string, string> = { left: 'Person left', unknown: 'Not in People', inactive: 'Unused 90+ days', never_used: 'Never used', admin: 'Admin' };
const FLAG_STYLE: Record<string, string> = {
  left: 'bg-red-500/15 text-red-300', unknown: 'bg-amber-500/15 text-amber-300', inactive: 'bg-amber-500/10 text-amber-200',
  never_used: 'bg-amber-500/10 text-amber-200', admin: 'bg-violet-500/15 text-violet-300',
};
const quarterName = (d = new Date()) => `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()} access review`;

export default function AccessReviewsTab({ data, refresh, navigate }: TabProps) {
  const { systems, reviews, nextDue } = data.access;
  const canEdit = data.user.role !== 'auditor';
  const [openId, setOpenId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const inProgress = reviews.filter(r => r.status === 'in_progress');
  const overdue = nextDue && new Date(nextDue) < new Date();

  if (openId) return <ReviewDetail id={openId} canEdit={canEdit} isAdmin={data.user.role === 'admin'} onBack={() => { setOpenId(null); refresh(); }} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access reviews"
        subtitle="Every quarter, confirm who has access to what. ControlLayer lists the accounts in each connected system, flags the ones that need a closer look, and saves your decisions as audit evidence."
        actions={canEdit && <Button onClick={() => setStarting(true)} disabled={!systems.length && !canEdit}><Play size={15} /> Start a review</Button>}
      />

      <Card className={cx('flex flex-wrap items-center gap-4 p-5', overdue || !nextDue ? 'border-amber-500/30' : 'border-emerald-500/20')}>
        <Clock className={overdue || !nextDue ? 'text-amber-400' : 'text-emerald-400'} />
        <div className="flex-1 text-sm">
          {!nextDue ? <p className="text-slate-200">No access review completed yet. SOC 2, ISO 27001, HIPAA and PCI DSS auditors expect one at least every quarter (PCI: every 6 months).</p>
            : overdue ? <p className="text-amber-200">The quarterly access review was due on {formatDate(nextDue)}.</p>
            : <p className="text-slate-200">Next quarterly review due by <strong>{formatDate(nextDue)}</strong>.</p>}
        </div>
        {inProgress[0] && <Button variant="secondary" onClick={() => setOpenId(inProgress[0].id)}>Continue &ldquo;{inProgress[0].name}&rdquo;</Button>}
      </Card>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Systems you can review</h3>
        {systems.length === 0 ? (
          <Card className="p-6 text-sm text-slate-400">
            Connect Google Workspace, Microsoft 365, Active Directory, GitHub or a cloud account under Integrations and run a scan; their accounts appear here. You can also review any other system by uploading a CSV of its users.
            <div className="mt-3"><Button size="sm" variant="secondary" onClick={() => navigate('connectors')}>Go to Integrations</Button></div>
          </Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {systems.map(s => (
              <Card key={s.provider} className="p-4">
                <p className="font-medium text-slate-100">{s.name}</p>
                <p className="text-xs text-slate-500">{s.accounts} active accounts{s.sample ? ' · sample' : ''}{s.seenAt ? ` · as of ${formatDate(s.seenAt)}` : ''}</p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Reviews</h3>
        {reviews.length === 0 ? (
          <Card className="p-6"><Empty icon={UserCheck} title="No reviews yet">Start one to go through every account with a keep / remove decision.</Empty></Card>
        ) : (
          <Card className="divide-y divide-slate-800">
            {reviews.map(r => (
              <button key={r.id} onClick={() => setOpenId(r.id)} className="flex w-full flex-col gap-2 px-5 py-4 text-left hover:bg-slate-800/40 md:flex-row md:items-center md:gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-100">{r.name}</p>
                  <p className="text-xs text-slate-500">Started {formatDate(r.createdAt)} by {r.createdBy}{r.completedAt ? ` · completed ${formatDate(r.completedAt)}` : r.dueDate ? ` · due ${formatDate(r.dueDate)}` : ''}</p>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-slate-400">{r.total} accounts</span>
                  {r.remove > 0 && <span className="text-red-300">{r.remove} to remove</span>}
                  {r.status === 'completed'
                    ? <span className="flex items-center gap-1 font-semibold text-emerald-400"><CheckCircle2 size={13} /> Completed</span>
                    : <span className="text-amber-300">{r.pending} pending</span>}
                </div>
              </button>
            ))}
          </Card>
        )}
      </section>

      {starting && <StartReview systems={systems} onClose={() => setStarting(false)} onStarted={id => { setStarting(false); refresh(); setOpenId(id); }} />}
    </div>
  );
}

function StartReview({ systems, onClose, onStarted }: { systems: TabProps['data']['access']['systems']; onClose: () => void; onStarted: (id: string) => void }) {
  const [name, setName] = useState(quarterName());
  const [chosen, setChosen] = useState<string[]>(systems.map(s => s.provider));
  const [due, setDue] = useState('');
  const [extraSystem, setExtraSystem] = useState('');
  const [extraCsv, setExtraCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Start an access review" onClose={onClose} wide>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></Field>
          <Field label="Due (optional)"><input className={inputCls} type="date" value={due} onChange={e => setDue(e.target.value)} /></Field>
        </div>
        {systems.length > 0 && (
          <Field label="Systems">
            <div className="grid gap-2 sm:grid-cols-2">
              {systems.map(s => (
                <label key={s.provider} className="flex items-center gap-2 rounded-lg border border-slate-800 px-3 py-2 text-sm text-slate-300">
                  <input type="checkbox" checked={chosen.includes(s.provider)} onChange={e => setChosen(e.target.checked ? [...chosen, s.provider] : chosen.filter(x => x !== s.provider))} />
                  {s.name} <span className="text-xs text-slate-500">({s.accounts})</span>
                </label>
              ))}
            </div>
          </Field>
        )}
        <details className="rounded-lg border border-slate-800 p-3" open={!systems.length}>
          <summary className="cursor-pointer text-sm text-slate-300">Also review another system from a CSV (e.g. Salesforce, Stripe dashboard, your admin panel)</summary>
          <div className="mt-3 space-y-3">
            <Field label="System name"><input className={inputCls} value={extraSystem} onChange={e => setExtraSystem(e.target.value)} placeholder="Salesforce" /></Field>
            <Field label="Users (CSV)" hint="Header row with name and/or email; optional role and last login columns. Export it from the system's user list.">
              <input type="file" accept=".csv,text/csv" className="mb-2 block text-xs text-slate-400" onChange={async e => { const f = e.target.files?.[0]; if (f) setExtraCsv(await f.text()); }} />
              <textarea className={cx(inputCls, 'h-28 font-mono text-xs')} value={extraCsv} onChange={e => setExtraCsv(e.target.value)} placeholder={'name,email,role,last login\nJane Smith,jane@acme.com,Admin,2026-10-01'} />
            </Field>
          </div>
        </details>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end">
          <Button disabled={busy || !name.trim() || (!chosen.length && !extraCsv.trim()) || (!!extraCsv.trim() && !extraSystem.trim())} onClick={async () => {
            setBusy(true); setError('');
            try {
              const r = await api<{ id: string }>('/api/access-reviews', { method: 'POST', json: { name, providers: chosen, dueDate: due || null, extraSystem, extraCsv } });
              onStarted(r.id);
            } catch (e) { setError((e as Error).message); setBusy(false); }
          }}>{busy ? 'Starting…' : 'Start review'}</Button>
        </div>
      </div>
    </Modal>
  );
}

function ReviewDetail({ id, canEdit, isAdmin, onBack }: { id: string; canEdit: boolean; isAdmin: boolean; onBack: () => void }) {
  const [r, setR] = useState<Review | null>(null);
  const [filter, setFilter] = useState<'flagged' | 'pending' | 'all' | 'actions'>('flagged');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changing, setChanging] = useState<Item | null>(null);
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion(v => v + 1), []);
  useEffect(() => { api<Review>(`/api/access-reviews/${id}`).then(setR).catch(e => setError((e as Error).message)); }, [id, version]);

  const done = r?.status === 'completed';
  const items = useMemo(() => (r?.items ?? []).filter(i =>
    filter === 'all' ? true : filter === 'pending' ? i.decision === 'pending' : filter === 'actions' ? i.decision === 'remove' || i.decision === 'change'
      : i.flags.some(f => f !== 'admin') || i.isAdmin), [r, filter]);
  const systems = useMemo(() => [...new Set(items.map(i => i.system))], [items]);

  async function decide(itemIds: string[], decision: string, note?: string) {
    setBusy(true); setError('');
    try {
      await api(`/api/access-reviews/${id}/decide`, { method: 'POST', json: { itemIds, decision, note } });
      setR(prev => prev && { ...prev, items: prev.items.map(i => (itemIds.includes(i.id) ? { ...i, decision: decision as Item['decision'], note: note ?? i.note } : i)) });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  if (!r) return <div className="space-y-4"><Button variant="ghost" onClick={onBack}><ArrowLeft size={15} /> Back</Button><ErrorText>{error}</ErrorText></div>;
  const decided = r.items.filter(i => i.decision !== 'pending').length;
  const flagged = r.items.filter(i => i.flags.some(f => f !== 'admin') || i.isAdmin).length;
  const followUps = r.items.filter(i => i.decision === 'remove');

  return (
    <div className="space-y-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={15} /> All access reviews</button>
      <PageHeader title={r.name} subtitle={`${r.items.length} accounts in ${r.systems.join(', ')}`}
        actions={canEdit && !done && <>
          {isAdmin && <Button variant="ghost" disabled={busy} onClick={async () => { if (confirm('Delete this review in progress?')) { await api(`/api/access-reviews/${id}`, { method: 'DELETE' }); onBack(); } }}><Trash2 size={14} /> Delete</Button>}
          <Button disabled={busy || decided < r.items.length} onClick={async () => {
            setBusy(true); setError('');
            try { await api(`/api/access-reviews/${id}/complete`, { method: 'POST' }); reload(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
          }}><Check size={15} /> Complete review</Button>
        </>} />

      <Card className="space-y-3 p-5">
        <div className="flex justify-between text-xs text-slate-400"><span>{decided} of {r.items.length} decided</span><span>{flagged} flagged for a closer look</span></div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-emerald-500" style={{ width: `${(decided / r.items.length) * 100}%` }} /></div>
        {!done && r.items.filter(i => i.flags.includes('unknown')).length > r.items.length / 3 && (
          <p className="text-xs text-amber-300">Many accounts aren&apos;t linked to anyone in People. Import your team (People &gt; Import from Google Workspace / Microsoft 365) and start a new review for more useful flags.</p>
        )}
        {done && <p className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 size={15} /> Completed {formatDate(r.completedAt)} by {r.completedBy}. Saved as audit evidence.</p>}
        <ErrorText>{error}</ErrorText>
      </Card>

      {done && followUps.length > 0 && (
        <Card className="space-y-2 p-5">
          <h3 className="font-semibold text-slate-100">Removal follow-up</h3>
          <p className="text-sm text-slate-400">Each later scan checks whether accounts marked for removal are really gone.</p>
          <ul className="space-y-1.5 text-sm">
            {followUps.map(i => (
              <li key={i.id} className="flex flex-wrap items-center gap-2">
                {i.removal === 'removed' ? <CheckCircle2 size={14} className="text-emerald-400" /> : i.removal === 'still_active' ? <UserX size={14} className="text-red-400" /> : <CircleDot size={14} className="text-slate-500" />}
                <span className="text-slate-200">{i.email ?? i.name}</span><span className="text-xs text-slate-500">{i.system}</span>
                <span className={cx('text-xs', i.removal === 'removed' ? 'text-emerald-400' : i.removal === 'still_active' ? 'text-red-300' : 'text-slate-500')}>
                  {i.removal === 'removed' ? 'Removed (confirmed by scan)' : i.removal === 'still_active' ? 'Still active at the latest scan' : i.removal === 'not_rescanned' ? 'Waiting for the next scan' : 'Confirm manually'}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        {([['flagged', `Flagged (${flagged})`], ['pending', `Pending (${r.items.length - decided})`], ['actions', `Remove / change (${r.items.filter(i => i.decision === 'remove' || i.decision === 'change').length})`], ['all', `All (${r.items.length})`]] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} className={cx('rounded-lg px-3 py-2 text-sm font-medium', filter === f ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-slate-800')}>{label}</button>
        ))}
      </div>

      {systems.map(sys => {
        const rows = items.filter(i => i.system === sys);
        const unflaggedPending = r.items.filter(i => i.system === sys && i.decision === 'pending' && !i.flags.length);
        return (
          <section key={sys} className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-200">{sys} <span className="font-normal text-slate-500">({rows.length})</span></h3>
              {canEdit && !done && unflaggedPending.length > 0 && (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide(unflaggedPending.map(i => i.id), 'keep')}>
                  <UserCheck size={13} /> Keep all {unflaggedPending.length} unflagged
                </Button>
              )}
            </div>
            <Card className="divide-y divide-slate-800">
              {rows.map(i => (
                <div key={i.id} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm text-slate-100">
                      {i.isAdmin && <KeyRound size={13} className="text-violet-400" />}
                      {i.email ?? i.name}
                      {i.flags.filter(f => f !== 'admin').map(f => <span key={f} className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', FLAG_STYLE[f])}>{FLAG_LABEL[f]}</span>)}
                      {i.isAdmin && <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold', FLAG_STYLE.admin)}>Admin</span>}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {[i.personName ? `Belongs to ${i.personName}` : i.email && i.name !== i.email ? i.name : null, i.detail, i.lastActivity ? `last active ${formatDate(i.lastActivity)}` : null].filter(Boolean).join(' · ')}
                    </p>
                    {i.note && <p className="text-xs text-sky-300">{i.note}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {(['keep', 'remove', 'change'] as const).map(d => (
                      <button key={d} disabled={!canEdit || done || busy}
                        onClick={() => (d === 'change' ? setChanging(i) : decide([i.id], i.decision === d ? 'pending' : d))}
                        className={cx('flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs disabled:cursor-default',
                          i.decision === d
                            ? d === 'keep' ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : d === 'remove' ? 'border-red-500/50 bg-red-500/15 text-red-300' : 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                            : 'border-slate-700 text-slate-400 hover:border-slate-500 disabled:hover:border-slate-700')}>
                        {d === 'keep' ? <UserCheck size={12} /> : d === 'remove' ? <UserX size={12} /> : <Pencil size={12} />}
                        {d === 'keep' ? 'Keep' : d === 'remove' ? 'Remove' : 'Change'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </Card>
          </section>
        );
      })}
      {items.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{filter === 'flagged' ? 'Nothing flagged. Check the other tabs.' : 'Nothing here.'}</p>}

      {changing && <ChangeNote item={changing} onClose={() => setChanging(null)} onSave={note => { void decide([changing.id], 'change', note); setChanging(null); }} />}
    </div>
  );
}

function ChangeNote({ item, onClose, onSave }: { item: Item; onClose: () => void; onSave: (note: string) => void }) {
  const [note, setNote] = useState(item.note ?? (item.isAdmin ? 'Remove admin rights' : ''));
  return (
    <Modal title={`Change access: ${item.email ?? item.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="What should change?"><input className={inputCls} autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Remove admin rights; move to read-only" /></Field>
        <div className="flex justify-end"><Button disabled={!note.trim()} onClick={() => onSave(note.trim())}>Save</Button></div>
      </div>
    </Modal>
  );
}
