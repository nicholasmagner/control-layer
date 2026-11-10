'use client';

import { AlertTriangle, Bot, Building, Check, CheckCircle2, Copy, Download, FileCheck2, Mail, Plus, Save, Search, Send, Trash2, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { VendorView } from '@/vendors/service';
import { DATA_TYPES, VENDOR_CATALOG, VENDOR_CATEGORIES } from '@/vendors/catalog';
import { VENDOR_QUESTIONS } from '@/vendors/risk';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatBytes, formatDate, inputBase, inputCls, Modal, PageHeader } from './ui';

export const TIER_STYLE: Record<string, string> = {
  critical: 'border-red-500/40 bg-red-500/10 text-red-300',
  high: 'border-orange-500/40 bg-orange-500/10 text-orange-300',
  medium: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  low: 'border-slate-600 bg-slate-800 text-slate-300',
};
const SIGNAL_STYLE: Record<string, string> = { high: 'text-red-300 bg-red-500/10', medium: 'text-amber-300 bg-amber-500/10', low: 'text-slate-300 bg-slate-800' };
const DOC_KINDS: Record<string, string> = { soc2: 'SOC 2 report', iso27001: 'ISO 27001 certificate', pentest: 'Penetration test', questionnaire: 'Security questionnaire', contract: 'Contract', dpa: 'DPA', baa: 'BAA', other: 'Other' };
const dataLabel = (id: string) => DATA_TYPES.find(d => d.id === id)?.label ?? id;

export function TierBadge({ tier }: { tier: string }) {
  return <span className={cx('rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize', TIER_STYLE[tier])}>{tier}</span>;
}

type Filter = 'all' | 'attention' | 'high' | 'ai' | 'sub' | 'off';

export default function VendorsTab({ data, refresh }: TabProps) {
  const { vendors, suggestions } = data.vendors;
  const canEdit = data.user.role !== 'auditor';
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const active = vendors.filter(v => v.status === 'active');
  const attention = active.filter(v => v.signals.some(s => s.level === 'high'));
  const due = active.filter(v => v.nextReviewDue && new Date(v.nextReviewDue).getTime() < Date.now() + 30 * 86_400_000);
  const ai = active.filter(v => v.usesAi);
  const list = useMemo(() => vendors.filter(v => {
    if (search && !`${v.name} ${v.category}`.toLowerCase().includes(search.toLowerCase())) return false;
    switch (filter) {
      case 'attention': return v.status === 'active' && v.signals.some(s => s.level === 'high');
      case 'high': return v.status === 'active' && (v.tier === 'critical' || v.tier === 'high');
      case 'ai': return v.status === 'active' && v.usesAi;
      case 'sub': return v.status === 'active' && v.subprocessor;
      case 'off': return v.status !== 'active';
      default: return v.status === 'active';
    }
  }).sort((a, b) => ['critical', 'high', 'medium', 'low'].indexOf(a.tier) - ['critical', 'high', 'medium', 'low'].indexOf(b.tier) || a.name.localeCompare(b.name)), [vendors, filter, search]);
  const open = vendors.find(v => v.id === openId) ?? null;

  async function run(fn: () => Promise<string | void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const msg = await fn();
      if (msg) setNotice(msg);
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
        title="Vendors"
        subtitle="Every company that touches your data, with its risk tier, agreements, security reports and reviews. Auditors and customers ask for this list."
        actions={canEdit && <>
          {active.length > 0 && <Button variant="secondary" disabled={busy} onClick={() => run(async () => {
            const r = await api<{ count: number }>('/api/vendors/inventory', { method: 'POST' });
            return `Saved the inventory of ${r.count} vendors as evidence.`;
          })}><Save size={15} /> Save inventory as evidence</Button>}
          <Button onClick={() => setAdding(true)}><Plus size={15} /> Add vendor</Button>
        </>}
      />
      {notice && <p className="text-sm text-emerald-400">{notice}</p>}
      <ErrorText>{error}</ErrorText>

      {canEdit && suggestions.length > 0 && (
        <Card className="flex flex-wrap items-center gap-3 border-sky-500/30 bg-sky-500/5 p-4 text-sm">
          <Building size={18} className="text-sky-400" />
          <span className="flex-1 text-slate-200">You use {suggestions.join(', ')} (from Integrations). Add {suggestions.length === 1 ? 'it as a vendor' : 'them as vendors'}?</span>
          <Button size="sm" disabled={busy} onClick={() => run(async () => { await api('/api/vendors', { method: 'POST', json: { names: suggestions } }); })}>Add {suggestions.length === 1 ? 'it' : 'all'}</Button>
        </Card>
      )}

      {vendors.length === 0 ? (
        <Card className="p-8">
          <Empty icon={Building} title="No vendors yet">
            Add the services you use: cloud hosting, email, payments, support tools, AI services. Pick from {VENDOR_CATALOG.length} common vendors and ControlLayer fills in the details and risk tier for you.
            {canEdit && <div className="mt-4"><Button onClick={() => setAdding(true)}><Plus size={15} /> Add vendors</Button></div>}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Active vendors" value={active.length} hint={`${active.filter(v => v.tier === 'critical' || v.tier === 'high').length} critical or high risk`} onClick={() => setFilter('high')} />
            <Stat label="Need attention" value={attention.length} tone={attention.length ? 'bad' : 'good'} hint="Missing reports, agreements or reviews" onClick={() => setFilter('attention')} />
            <Stat label="Reviews due" value={due.length} tone={due.length ? 'warn' : 'good'} hint="Overdue or due in 30 days" onClick={() => setFilter('attention')} />
            <Stat label="AI vendors" value={ai.length} hint={`${ai.filter(v => v.aiTrainsOnData !== false).length} not confirmed to stay out of AI training`} onClick={() => setFilter('ai')} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([['all', 'Active'], ['attention', 'Needs attention'], ['high', 'Critical & high'], ['ai', 'AI vendors'], ['sub', 'Subprocessors'], ['off', 'Offboarded']] as const).map(([f, label]) => (
              <button key={f} onClick={() => setFilter(f)} className={cx('rounded-lg px-3 py-2 text-sm font-medium', filter === f ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-slate-800')}>{label}</button>
            ))}
            <div className="relative ml-auto w-64">
              <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
              <input className={cx(inputBase, 'w-full pl-9')} placeholder="Search vendors" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <Card className="divide-y divide-slate-800">
            {list.map(v => (
              <button key={v.id} onClick={() => setOpenId(v.id)} className="flex w-full flex-col gap-2 px-5 py-3.5 text-left hover:bg-slate-800/40 md:flex-row md:items-center md:gap-4">
                <div className="min-w-0 md:w-64">
                  <p className="flex items-center gap-2 font-medium text-slate-100">{v.name}{v.usesAi && <span title="Uses AI"><Bot size={14} className="text-violet-400" /></span>}</p>
                  <p className="truncate text-xs text-slate-500" title={v.dataAccess.map(dataLabel).join(', ')}>{v.category}{v.dataAccess.length ? ` · ${v.dataAccess.map(dataLabel).join(', ')}` : ''}</p>
                </div>
                <div className="md:w-20"><TierBadge tier={v.tier} /></div>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                  {v.signals.length === 0 && v.status === 'active' && <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 size={13} /> No open issues</span>}
                  {v.signals.slice(0, 3).map(s => <span key={s.id} className={cx('rounded px-2 py-0.5 text-[11px]', SIGNAL_STYLE[s.level])}>{s.text}</span>)}
                  {v.signals.length > 3 && <span className="text-[11px] text-slate-500">+{v.signals.length - 3} more</span>}
                </div>
                <div className="text-xs text-slate-500 md:w-36 md:text-right">
                  {v.status !== 'active' ? 'Offboarded' : v.nextReviewDue ? `Review by ${formatDate(v.nextReviewDue)}` : 'No review needed'}
                </div>
              </button>
            ))}
            {list.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing here.</p>}
          </Card>
        </>
      )}

      {adding && <AddVendor existing={vendors.map(v => v.name)} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); refresh(); }} />}
      {open && <VendorDetail vendor={open} canEdit={canEdit} isAdmin={data.user.role === 'admin'} hipaa={data.settings.frameworks.includes('HIPAA')} onClose={() => setOpenId(null)} refresh={refresh} />}
    </div>
  );
}

function Stat({ label, value, hint, tone, onClick }: { label: string; value: number; hint: string; tone?: 'good' | 'bad' | 'warn'; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 text-left hover:border-slate-700">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold', tone === 'bad' ? 'text-red-400' : tone === 'warn' ? 'text-amber-400' : tone === 'good' ? 'text-emerald-400' : 'text-slate-100')}>{value}</p>
      <p className="mt-1 text-xs text-slate-500">{hint}</p>
    </button>
  );
}

function AddVendor({ existing, onClose, onAdded }: { existing: string[]; onClose: () => void; onAdded: () => void }) {
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState(false);
  const [form, setForm] = useState({ name: '', website: '', category: 'Other', dataAccess: [] as string[], usesAi: false, businessCritical: false });
  const [error, setError] = useState('');
  const [added, setAdded] = useState<string[]>([]);
  const have = new Set([...existing, ...added].map(n => n.toLowerCase()));
  const matches = VENDOR_CATALOG.filter(c => !q || `${c.name} ${c.category}`.toLowerCase().includes(q.toLowerCase())).slice(0, 40);

  async function addCatalog(name: string) {
    setError('');
    try {
      await api('/api/vendors', { method: 'POST', json: { catalog: name } });
      setAdded([...added, name]);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Modal title="Add vendors" onClose={() => (added.length ? onAdded() : onClose())} wide>
      {!custom ? (
        <div className="space-y-4">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-500" />
            <input autoFocus className={cx(inputCls, 'pl-9')} placeholder="Search common vendors (Stripe, Slack, OpenAI…)" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div className="grid max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2">
            {matches.map(c => {
              const isIn = have.has(c.name.toLowerCase());
              return (
                <button key={c.name} disabled={isIn} onClick={() => addCatalog(c.name)}
                  className="flex items-center gap-3 rounded-lg border border-slate-800 px-3 py-2 text-left hover:border-sky-500/50 disabled:opacity-60 disabled:hover:border-slate-800">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-200">{c.name}</span>
                    <span className="block truncate text-xs text-slate-500">{c.category}</span>
                  </span>
                  {isIn ? <Check size={15} className="text-emerald-400" /> : <Plus size={15} className="text-slate-500" />}
                </button>
              );
            })}
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={() => { setCustom(true); setForm({ ...form, name: q }); }}>Not listed? Add it yourself</Button>
            <Button onClick={() => (added.length ? onAdded() : onClose())}>{added.length ? `Done (${added.length} added)` : 'Close'}</Button>
          </div>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={async e => {
          e.preventDefault();
          try {
            await api('/api/vendors', { method: 'POST', json: form });
            onAdded();
          } catch (err) {
            setError((err as Error).message);
          }
        }}>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Name"><input className={inputCls} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Website"><input className={inputCls} value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="example.com" /></Field>
            <Field label="Category">
              <select className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {VENDOR_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
          </div>
          <DataAccessPicker value={form.dataAccess} onChange={d => setForm({ ...form, dataAccess: d })} />
          <div className="flex flex-wrap gap-5 text-sm text-slate-300">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.businessCritical} onChange={e => setForm({ ...form, businessCritical: e.target.checked })} /> We can&apos;t operate without it</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.usesAi} onChange={e => setForm({ ...form, usesAi: e.target.checked })} /> Uses AI on our data</label>
          </div>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-between">
            <Button type="button" variant="ghost" onClick={() => setCustom(false)}>Back to the catalog</Button>
            <Button type="submit" disabled={!form.name.trim()}>Add vendor</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function DataAccessPicker({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <Field label="What can they access?" hint="Drives the risk tier: sensitive data makes a vendor high risk; add 'can't operate without it' for critical.">
      <div className="flex flex-wrap gap-1.5">
        {DATA_TYPES.map(d => (
          <button type="button" key={d.id} disabled={disabled} onClick={() => onChange(value.includes(d.id) ? value.filter(x => x !== d.id) : [...value, d.id])}
            className={cx('rounded-md border px-2.5 py-1 text-xs', value.includes(d.id) ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-slate-700 text-slate-400 hover:border-slate-500')}>
            {d.label}
          </button>
        ))}
      </div>
    </Field>
  );
}

function VendorDetail({ vendor: v, canEdit, isAdmin, hipaa, onClose, refresh }: {
  vendor: VendorView; canEdit: boolean; isAdmin: boolean; hipaa: boolean; onClose: () => void; refresh: () => void;
}) {
  const [section, setSection] = useState<'overview' | 'documents' | 'reviews' | 'questionnaire'>('overview');
  return (
    <Modal title={v.name} onClose={onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <TierBadge tier={v.tier} />
          <span className="text-xs text-slate-500">{v.category}{v.website ? ` · ${v.website}` : ''}</span>
          {v.status !== 'active' && <span className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-slate-400">Offboarded</span>}
        </div>
        {v.signals.length > 0 && (
          <ul className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
            {v.signals.map(s => (
              <li key={s.id} className="flex items-center gap-2 text-sm"><AlertTriangle size={14} className={s.level === 'high' ? 'text-red-400' : s.level === 'medium' ? 'text-amber-400' : 'text-slate-400'} /><span className="text-slate-300">{s.text}</span></li>
            ))}
          </ul>
        )}
        <div className="flex gap-1 rounded-lg bg-slate-950 p-1 text-sm">
          {([['overview', 'Details'], ['documents', `Documents (${v.documents.length})`], ['reviews', `Reviews (${v.reviews.length})`], ['questionnaire', 'Questionnaire']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setSection(id)} className={cx('flex-1 rounded-md py-1.5', section === id ? 'bg-slate-800 font-medium text-slate-100' : 'text-slate-400')}>{label}</button>
          ))}
        </div>
        {section === 'overview' && <VendorForm vendor={v} canEdit={canEdit} isAdmin={isAdmin} hipaa={hipaa} refresh={refresh} onRemoved={onClose} />}
        {section === 'documents' && <VendorDocuments vendor={v} canEdit={canEdit} refresh={refresh} />}
        {section === 'reviews' && <VendorReviews vendor={v} canEdit={canEdit} refresh={refresh} />}
        {section === 'questionnaire' && <VendorQuestionnaireSection vendor={v} canEdit={canEdit} refresh={refresh} />}
      </div>
    </Modal>
  );
}

function VendorForm({ vendor: v, canEdit, isAdmin, hipaa, refresh, onRemoved }: { vendor: VendorView; canEdit: boolean; isAdmin: boolean; hipaa: boolean; refresh: () => void; onRemoved: () => void }) {
  const init = {
    owner: v.owner ?? '', description: v.description ?? '', dataAccess: v.dataAccess, businessCritical: v.businessCritical, usesAi: v.usesAi,
    aiTrainsOnData: v.aiTrainsOnData === null ? 'unknown' : v.aiTrainsOnData ? 'yes' : 'no', subprocessor: v.subprocessor, dataLocation: v.dataLocation ?? '',
    tierOverride: v.tierOverride ?? '', dpaSigned: v.dpaSigned, baaSigned: v.baaSigned, contractEnd: v.contractEnd?.slice(0, 10) ?? '', trustUrl: v.trustUrl ?? '', notes: v.notes ?? '',
  };
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/vendors/${v.id}`, { method: 'PATCH', json: { ...f, aiTrainsOnData: f.aiTrainsOnData === 'unknown' ? null : f.aiTrainsOnData === 'yes', tierOverride: f.tierOverride || null, ...extra } });
      setSaved(true);
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !canEdit;
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Internal owner"><input className={inputCls} disabled={disabled} value={f.owner} onChange={e => setF({ ...f, owner: e.target.value })} placeholder="name@company.com" /></Field>
        <Field label="What we use it for"><input className={inputCls} disabled={disabled} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} placeholder="e.g. Payment processing" /></Field>
      </div>
      <DataAccessPicker value={f.dataAccess} disabled={disabled} onChange={d => setF({ ...f, dataAccess: d })} />
      <div className="grid gap-3 md:grid-cols-3">
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" disabled={disabled} checked={f.businessCritical} onChange={e => setF({ ...f, businessCritical: e.target.checked })} /> We can&apos;t operate without it</label>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" disabled={disabled} checked={f.subprocessor} onChange={e => setF({ ...f, subprocessor: e.target.checked })} /> Subprocessor (processes customer data for us)</label>
        <label className="flex items-center gap-2 text-sm text-slate-300"><input type="checkbox" disabled={disabled} checked={f.usesAi} onChange={e => setF({ ...f, usesAi: e.target.checked })} /> Uses AI</label>
      </div>
      {f.usesAi && (
        <Field label="Can they train AI models on our data?">
          <select className={inputCls} disabled={disabled} value={f.aiTrainsOnData} onChange={e => setF({ ...f, aiTrainsOnData: e.target.value })}>
            <option value="unknown">Not checked yet</option><option value="no">No: their terms (or our settings) exclude it</option><option value="yes">Yes, they may</option>
          </select>
        </Field>
      )}
      <div className="grid gap-3 md:grid-cols-4">
        <label className="flex items-center gap-2 pt-1 text-sm text-slate-300"><input type="checkbox" disabled={disabled} checked={f.dpaSigned} onChange={e => setF({ ...f, dpaSigned: e.target.checked })} /> DPA signed</label>
        {hipaa && <label className="flex items-center gap-2 pt-1 text-sm text-slate-300"><input type="checkbox" disabled={disabled} checked={f.baaSigned} onChange={e => setF({ ...f, baaSigned: e.target.checked })} /> BAA signed</label>}
        <Field label="Contract ends"><input type="date" className={inputCls} disabled={disabled} value={f.contractEnd} onChange={e => setF({ ...f, contractEnd: e.target.value })} /></Field>
        <Field label="Data location"><input className={inputCls} disabled={disabled} value={f.dataLocation} onChange={e => setF({ ...f, dataLocation: e.target.value })} placeholder="e.g. US, EU" /></Field>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Their security / trust page"><input className={inputCls} disabled={disabled} value={f.trustUrl} onChange={e => setF({ ...f, trustUrl: e.target.value })} placeholder="https://trust.example.com" /></Field>
        <Field label="Risk tier" hint={`Calculated: ${v.tier}. Override only with a reason in the notes.`}>
          <select className={inputCls} disabled={disabled} value={f.tierOverride} onChange={e => setF({ ...f, tierOverride: e.target.value })}>
            <option value="">Automatic</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea className={cx(inputCls, 'h-20')} disabled={disabled} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></Field>
      <ErrorText>{error}</ErrorText>
      {canEdit && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => save({ status: v.status === 'active' ? 'offboarded' : 'active' })}>{v.status === 'active' ? 'Mark as offboarded' : 'Mark as active'}</Button>
            {isAdmin && <Button variant="ghost" size="sm" disabled={busy} onClick={async () => {
              if (!confirm(`Remove ${v.name} and its documents? Reviews already saved as evidence are kept. To keep the history, mark it as offboarded instead.`)) return;
              await api(`/api/vendors/${v.id}`, { method: 'DELETE' }); refresh(); onRemoved();
            }}><Trash2 size={13} /> Remove</Button>}
          </div>
          <div className="flex items-center gap-3">
            {saved && !dirty && <span className="flex items-center gap-1 text-sm text-emerald-400"><Check size={14} /> Saved</span>}
            <Button disabled={busy || !dirty} onClick={() => save()}>Save</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function VendorDocuments({ vendor: v, canEdit, refresh }: { vendor: VendorView; canEdit: boolean; refresh: () => void }) {
  const [kind, setKind] = useState('soc2');
  const [until, setUntil] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="space-y-4">
      {v.documents.length ? (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {v.documents.map(d => {
            const expired = d.validUntil && new Date(d.validUntil) < new Date();
            return (
              <li key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <FileCheck2 size={16} className={expired ? 'text-red-400' : 'text-sky-400'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-slate-200">{d.title}</p>
                  <p className="text-xs text-slate-500">{DOC_KINDS[d.kind] ?? d.kind} · {formatBytes(d.fileSize)}{d.validUntil ? ` · ${expired ? 'expired' : 'valid until'} ${formatDate(d.validUntil)}` : ''} · {d.uploadedBy}</p>
                </div>
                <a href={`/api/vendors/${v.id}/documents/${d.id}`} className="text-slate-400 hover:text-slate-200" title="Download"><Download size={15} /></a>
                {canEdit && <button className="text-slate-500 hover:text-red-300" title="Delete" onClick={async () => { if (confirm('Delete this document?')) { await api(`/api/vendors/${v.id}/documents/${d.id}`, { method: 'DELETE' }); refresh(); } }}><Trash2 size={15} /></button>}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-slate-500">No documents yet. For high-risk vendors, keep their current SOC 2 report or ISO 27001 certificate here, plus your DPA.</p>}
      {canEdit && (
        <div className="grid gap-3 rounded-lg border border-slate-800 p-4 md:grid-cols-4">
          <Field label="Type">
            <select className={inputCls} value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(DOC_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Valid until" hint="SOC 2: report end + 12 months"><input type="date" className={inputCls} value={until} onChange={e => setUntil(e.target.value)} /></Field>
          <Field label="File"><input type="file" className="block w-full pt-1.5 text-xs text-slate-400 file:mr-2 file:rounded file:border-0 file:bg-slate-800 file:px-2 file:py-1 file:text-slate-200" onChange={e => setFile(e.target.files?.[0] ?? null)} /></Field>
          <div className="flex items-end">
            <Button className="w-full" disabled={busy || !file} onClick={async () => {
              setBusy(true); setError('');
              const body = new FormData();
              body.set('kind', kind); body.set('validUntil', until); body.set('file', file!); body.set('title', `${DOC_KINDS[kind]} – ${v.name}`);
              try { await api(`/api/vendors/${v.id}/documents`, { method: 'POST', body }); setFile(null); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
            }}><Upload size={14} /> Upload</Button>
          </div>
          <div className="md:col-span-4"><ErrorText>{error}</ErrorText></div>
        </div>
      )}
    </div>
  );
}

const REVIEW_ITEMS = [
  { id: 'report_reviewed', label: 'Reviewed their SOC 2 / ISO 27001 report or security questionnaire' },
  { id: 'exceptions_ok', label: 'Exceptions and complementary user entity controls (CUECs) are addressed' },
  { id: 'contract_terms', label: 'Contract includes confidentiality, security and breach notification terms' },
  { id: 'dpa', label: 'Data processing agreement in place (or not needed)' },
  { id: 'access_limited', label: 'Their access to our data and systems is limited to what they need' },
  { id: 'ai_terms', label: 'AI use is understood; no training on our data without consent (or not applicable)' },
];
const OUTCOME_LABEL: Record<string, string> = { approved: 'Approved', approved_with_conditions: 'Approved with conditions', rejected: 'Rejected' };

function VendorReviews({ vendor: v, canEdit, refresh }: { vendor: VendorView; canEdit: boolean; refresh: () => void }) {
  const hasReport = v.documents.some(d => (d.kind === 'soc2' || d.kind === 'iso27001') && (!d.validUntil || new Date(d.validUntil) > new Date())) || v.questionnaires.some(q => q.status === 'completed');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    report_reviewed: hasReport, dpa: v.dpaSigned || !v.dataAccess.some(d => ['customer_data', 'personal_data', 'health_data'].includes(d)), ai_terms: !v.usesAi || v.aiTrainsOnData === false,
  });
  const [outcome, setOutcome] = useState('approved');
  const [risk, setRisk] = useState('low');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  return (
    <div className="space-y-4">
      {v.reviews.length > 0 && (
        <ul className="divide-y divide-slate-800 rounded-lg border border-slate-800">
          {v.reviews.map(r => (
            <li key={r.id} className="px-4 py-3 text-sm">
              <p className="text-slate-200">{OUTCOME_LABEL[r.outcome] ?? r.outcome} · residual risk {r.residualRisk}</p>
              <p className="text-xs text-slate-500">{formatDate(r.reviewedAt)} by {r.reviewer}{r.evidenceId ? ' · saved as evidence' : ''}</p>
              {r.notes && <p className="mt-1 text-xs text-slate-400">{r.notes}</p>}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (done ? <p className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 size={15} /> Review recorded and saved as audit evidence.</p> : (
        <div className="space-y-3 rounded-lg border border-slate-800 p-4">
          <p className="text-sm font-medium text-slate-200">Record a review</p>
          {REVIEW_ITEMS.map(i => (
            <label key={i.id} className="flex items-start gap-2 text-sm text-slate-300">
              <input type="checkbox" className="mt-1" checked={!!checklist[i.id]} onChange={e => setChecklist({ ...checklist, [i.id]: e.target.checked })} /> {i.label}
            </label>
          ))}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Outcome">
              <select className={inputCls} value={outcome} onChange={e => setOutcome(e.target.value)}>
                {Object.entries(OUTCOME_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Remaining risk after review">
              <select className={inputCls} value={risk} onChange={e => setRisk(e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select>
            </Field>
          </div>
          <Field label="Notes"><textarea className={cx(inputCls, 'h-20')} value={notes} onChange={e => setNotes(e.target.value)} placeholder="What you checked, exceptions found, conditions agreed" /></Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex justify-end">
            <Button disabled={busy} onClick={async () => {
              setBusy(true); setError('');
              try { await api(`/api/vendors/${v.id}/reviews`, { method: 'POST', json: { outcome, residualRisk: risk, notes, checklist } }); setDone(true); refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
            }}>Record review</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function VendorQuestionnaireSection({ vendor: v, canEdit, refresh }: { vendor: VendorView; canEdit: boolean; refresh: () => void }) {
  const [email, setEmail] = useState('');
  const [link, setLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const latest = v.questionnaires.find(q => q.status === 'completed');
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">No SOC 2 report? Send the vendor a link to a short security questionnaire ({VENDOR_QUESTIONS.length} questions). They answer without an account, can attach a report, and you see a score here.</p>
      {latest && latest.answers && (
        <div className="space-y-2 rounded-lg border border-slate-800 p-4">
          <p className="text-sm text-slate-200">Answered by {latest.respondent} on {formatDate(latest.completedAt)} · score <span className={cx('font-semibold', (latest.score ?? 0) >= 80 ? 'text-emerald-400' : (latest.score ?? 0) >= 60 ? 'text-amber-400' : 'text-red-400')}>{latest.score}/100</span></p>
          <ul className="space-y-1.5 text-xs">
            {VENDOR_QUESTIONS.map(q => {
              const a = latest.answers![q.id];
              return (
                <li key={q.id} className="flex gap-2">
                  <span className={cx('w-16 shrink-0 font-semibold uppercase', a?.answer === 'yes' ? 'text-emerald-400' : a?.answer === 'no' ? 'text-red-400' : 'text-amber-300')}>{a?.answer === 'na' ? 'N/A' : a?.answer}</span>
                  <span className="text-slate-400">{q.question}{a?.comment ? <span className="text-slate-500"> – {a.comment}</span> : ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {v.questionnaires.filter(q => q.status === 'sent').map(q => <p key={q.id} className="text-xs text-slate-500">Sent to {q.sentTo} on {formatDate(q.sentAt)}; waiting for answers (link valid until {formatDate(q.expiresAt)}).</p>)}
      {canEdit && (link ? (
        <div className="space-y-2 rounded-lg border border-slate-800 p-4">
          <p className="text-sm text-slate-300">Send this link to {email}. It works for 30 days.</p>
          <p className="break-all rounded bg-slate-950 p-2 font-mono text-xs text-slate-300">{link}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={async () => { await navigator.clipboard.writeText(link).catch(() => undefined); setCopied(true); }}>{copied ? <Check size={13} /> : <Copy size={13} />} Copy</Button>
            <a className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
              href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Security questionnaire')}&body=${encodeURIComponent(`Hello,\n\nAs part of our vendor security review, please answer this short questionnaire (about 10 minutes):\n\n${link}\n\nThank you!`)}`}><Mail size={13} /> Email</a>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Vendor contact email"><input className={cx(inputBase, 'w-72')} type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="security@vendor.com" /></Field>
          <Button disabled={!email.includes('@')} onClick={async () => {
            setError('');
            try { setLink((await api<{ url: string }>(`/api/vendors/${v.id}/questionnaire`, { method: 'POST', json: { email } })).url); refresh(); } catch (e) { setError((e as Error).message); }
          }}><Send size={14} /> Create link</Button>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}
