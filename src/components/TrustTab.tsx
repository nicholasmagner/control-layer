'use client';

import { Check, Copy, ExternalLink, FileText, Lock, Mail, Plus, ShieldCheck, Unlock } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import type { TrustConfig } from '@/trust/config';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatBytes, formatDate, inputCls, Modal, PageHeader } from './ui';

const STATUS_SUGGESTIONS = ['Audit in progress', 'Type I report available', 'Type II report available', 'Compliant', 'Certified'];

export default function TrustTab({ data, refresh }: TabProps) {
  const isAdmin = data.user.role === 'admin';
  const { config, documents, requests } = data.trust;
  const [adding, setAdding] = useState(false);
  const [link, setLink] = useState<{ url: string; email: string; name: string; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const pending = requests.filter(r => r.status === 'pending');
  const origin = useSyncExternalStore(() => () => undefined, () => window.location.origin, () => '');
  const publicUrl = `${origin}/trust`;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Trust Center" subtitle="A public page that shows customers how you protect their data." />
        <Card className="p-6 text-sm text-slate-400">
          {config.enabled
            ? <>The Trust Center is published at <a href="/trust" target="_blank" className="text-sky-400">{publicUrl}</a>. Only admins can change it.</>
            : 'The Trust Center is not published yet. Ask an admin to set it up.'}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Trust Center"
        subtitle="A public page that shows customers how you protect their data, so you answer fewer security questionnaires. Share audit reports and other documents with people who accept your confidentiality terms."
        actions={config.enabled && (
          <a href="/trust" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">
            <ExternalLink size={15} /> View public page
          </a>
        )}
      />
      <ErrorText>{error}</ErrorText>

      <Card className={cx('flex flex-col gap-4 p-5 md:flex-row md:items-center', config.enabled ? 'border-emerald-500/30' : '')}>
        <ShieldCheck className={config.enabled ? 'text-emerald-400' : 'text-slate-500'} />
        <div className="flex-1 text-sm">
          {config.enabled
            ? <p className="text-slate-200">Published at <span className="font-mono text-sky-300">{publicUrl}</span>. Link to it from your website and share it with customers.</p>
            : <p className="text-slate-300">Not published. Fill in the details below, add documents, then publish.</p>}
          {data.settings.sources.organizationName === 'default' && <p className="mt-1 text-xs text-amber-300">Set your organization name in Settings; the page shows &ldquo;{data.organization}&rdquo; until you do.</p>}
          {data.features.hasSampleData && <p className="mt-1 text-xs text-amber-300">Security practices are hidden while sample data is loaded; only real scan results are ever shown publicly.</p>}
          {!data.features.localInstall ? null : <p className="mt-1 text-xs text-amber-300">This is the desktop app: the page is only reachable by others if network access is turned on and this computer is online. For an always-on page, run ControlLayer on a server.</p>}
        </div>
        <Button variant={config.enabled ? 'secondary' : 'primary'} disabled={busy}
          onClick={() => run(() => api('/api/trust/settings', { method: 'PUT', json: { enabled: !config.enabled } }))}>
          {config.enabled ? 'Unpublish' : 'Publish'}
        </Button>
      </Card>

      {pending.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Access requests ({pending.length})</h3>
          <Card className="divide-y divide-slate-800">
            {pending.map(r => (
              <div key={r.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <div className="flex-1 text-sm">
                  <p className="font-medium text-slate-100">{r.name} <span className="font-normal text-slate-400">· {r.company}</span></p>
                  <p className="text-xs text-slate-500">{r.email} · {formatDate(r.createdAt, true)} · accepted the confidentiality terms</p>
                  {r.reason && <p className="mt-1 text-xs text-slate-400">&ldquo;{r.reason}&rdquo;</p>}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/api/trust/requests/${r.id}`, { method: 'PATCH', json: { action: 'deny' } }))}>Deny</Button>
                  <Button size="sm" disabled={busy} onClick={() => run(async () => {
                    const res = await api<{ url: string; expiresAt: string }>(`/api/trust/requests/${r.id}`, { method: 'PATCH', json: { action: 'approve' } });
                    setLink({ ...res, email: r.email, name: r.name });
                  })}>Approve</Button>
                </div>
              </div>
            ))}
          </Card>
        </section>
      )}

      <section className="space-y-3">
        <div className="flex items-end justify-between">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Documents</h3>
            <p className="text-sm text-slate-500">For example your SOC 2 report, penetration test summary, or security whitepaper.</p>
          </div>
          <Button variant="secondary" onClick={() => setAdding(true)}><Plus size={15} /> Add document</Button>
        </div>
        {documents.length === 0 ? (
          <Card className="p-6"><Empty icon={FileText} title="No documents yet">Documents are either public or shared on request.</Empty></Card>
        ) : (
          <Card className="divide-y divide-slate-800">
            {documents.map(d => (
              <div key={d.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                <FileText size={18} className="hidden shrink-0 text-sky-400 md:block" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-slate-100">{d.title}</p>
                  <p className="truncate text-xs text-slate-500">{d.fileName} · {formatBytes(d.fileSize)} · added {formatDate(d.createdAt)} by {d.uploadedBy}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy} title="Change who can download it"
                    onClick={() => run(() => api(`/api/trust/documents/${d.id}`, { method: 'PATCH', json: { access: d.access === 'public' ? 'request' : 'public' } }))}>
                    {d.access === 'public' ? <><Unlock size={13} /> Public</> : <><Lock size={13} /> On request</>}
                  </Button>
                  <a href={`/api/trust/documents/${d.id}`} className="inline-flex items-center rounded-lg px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800">Download</a>
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={() => confirm(`Remove "${d.title}" from the Trust Center?`) && run(() => api(`/api/trust/documents/${d.id}`, { method: 'DELETE' }))}>Remove</Button>
                </div>
              </div>
            ))}
          </Card>
        )}
      </section>

      <TrustSettings config={config} frameworks={data.frameworks.map(f => ({ id: f.id, name: f.name }))} onSaved={refresh} />

      {requests.some(r => r.status !== 'pending') && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Past requests</h3>
          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-800">
                {requests.filter(r => r.status !== 'pending').map(r => {
                  const active = r.status === 'approved' && r.expiresAt && new Date(r.expiresAt) > new Date();
                  return (
                    <tr key={r.id}>
                      <td className="px-4 py-3"><p className="text-slate-200">{r.name} · {r.company}</p><p className="text-xs text-slate-500">{r.email}</p></td>
                      <td className="px-4 py-3 text-xs text-slate-400">
                        {r.status === 'denied' ? `Denied / revoked by ${r.decidedBy ?? '—'}` : active ? `Access until ${formatDate(r.expiresAt)}` : 'Access expired'}
                        {r.lastUsedAt && <span className="block">Last download {formatDate(r.lastUsedAt, true)}</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {active && <Button size="sm" variant="ghost" disabled={busy} onClick={() => run(() => api(`/api/trust/requests/${r.id}`, { method: 'PATCH', json: { action: 'revoke' } }))}>Revoke</Button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {adding && <AddDocument onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
      {link && <ApprovedLink link={link} organization={data.organization} onClose={() => setLink(null)} />}
    </div>
  );
}

function TrustSettings({ config, frameworks, onSaved }: { config: TrustConfig; frameworks: { id: string; name: string }[]; onSaved: () => void }) {
  const [f, setF] = useState(config);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(config);
  const fwStatus = (id: string) => f.frameworks.find(x => x.id === id);

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Page content</h3>
      <Card className="space-y-5 p-6">
        <Field label="Headline"><input className={inputCls} value={f.headline} onChange={e => setF({ ...f, headline: e.target.value })} /></Field>
        <Field label="Introduction"><textarea className={`${inputCls} h-24`} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></Field>
        <Field label="Security contact email" hint="Shown on the page. Leave empty to hide.">
          <input className={inputCls} type="email" value={f.contactEmail} placeholder="security@yourcompany.com" onChange={e => setF({ ...f, contactEmail: e.target.value })} />
        </Field>

        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-300">Compliance</p>
          <p className="text-xs text-slate-500">Choose the frameworks to show, and describe where you are (for example &ldquo;Type II report available&rdquo;). Only claim what is true.</p>
          {frameworks.map(fw => {
            const item = fwStatus(fw.id);
            return (
              <div key={fw.id} className="flex flex-col gap-2 md:flex-row md:items-center">
                <label className="flex w-64 items-center gap-2 text-sm text-slate-300">
                  <input type="checkbox" checked={!!item} onChange={e => setF({
                    ...f,
                    frameworks: e.target.checked ? [...f.frameworks, { id: fw.id, status: '' }] : f.frameworks.filter(x => x.id !== fw.id),
                  })} />
                  {fw.name}
                </label>
                {item && (
                  <input className={`${inputCls} md:flex-1`} list="trust-status" value={item.status} placeholder="e.g. Type II report available"
                    onChange={e => setF({ ...f, frameworks: f.frameworks.map(x => (x.id === fw.id ? { ...x, status: e.target.value } : x)) })} />
                )}
              </div>
            );
          })}
          <datalist id="trust-status">{STATUS_SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
        </div>

        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" className="mt-1" checked={f.showPractices} onChange={e => setF({ ...f, showPractices: e.target.checked })} />
          <span>Show security practices verified by your latest scans <span className="block text-xs text-slate-500">Only practices whose checks all pass are shown, e.g. &ldquo;Multi-factor authentication&rdquo; or &ldquo;Encryption at rest&rdquo;. Details and findings are never shown.</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm text-slate-300">
          <input type="checkbox" className="mt-1" checked={f.showPolicies} onChange={e => setF({ ...f, showPolicies: e.target.checked })} />
          <span>List the titles of your published policies <span className="block text-xs text-slate-500">The policies themselves stay private unless you add them as documents.</span></span>
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Access links last">
            <select className={inputCls} value={f.accessDays} onChange={e => setF({ ...f, accessDays: Number(e.target.value) })}>
              {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>{d} days</option>)}
            </select>
          </Field>
          <div className="md:col-span-2">
            <Field label="Confidentiality terms (people accept these when they request access)">
              <textarea className={`${inputCls} h-24 text-xs`} value={f.ndaText} onChange={e => setF({ ...f, ndaText: e.target.value })} />
            </Field>
          </div>
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex items-center justify-end gap-3">
          {saved && !dirty && <span className="flex items-center gap-1 text-sm text-emerald-400"><Check size={14} /> Saved</span>}
          <Button disabled={busy || !dirty} onClick={async () => {
            setBusy(true);
            setError('');
            try {
              const { enabled: _enabled, ...rest } = f;
              void _enabled;
              await api('/api/trust/settings', { method: 'PUT', json: rest });
              setSaved(true);
              onSaved();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}>Save</Button>
        </div>
      </Card>
    </section>
  );
}

function AddDocument({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [access, setAccess] = useState<'request' | 'public'>('request');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal title="Add document" onClose={onClose}>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        if (!file) return;
        setBusy(true);
        setError('');
        const form = new FormData();
        form.set('title', title);
        form.set('description', description);
        form.set('access', access);
        form.set('file', file);
        try {
          await api('/api/trust/documents', { method: 'POST', body: form });
          onDone();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}>
        <Field label="File">
          <input type="file" required onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '')); }}
            className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" />
        </Field>
        <Field label="Title"><input className={inputCls} required value={title} onChange={e => setTitle(e.target.value)} placeholder="SOC 2 Type II report 2026" /></Field>
        <Field label="Description (optional)"><input className={inputCls} value={description} onChange={e => setDescription(e.target.value)} /></Field>
        <Field label="Who can download it">
          <select className={inputCls} value={access} onChange={e => setAccess(e.target.value as 'request' | 'public')}>
            <option value="request">On request: after you approve and they accept the confidentiality terms</option>
            <option value="public">Public: anyone who visits the page</option>
          </select>
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end"><Button type="submit" disabled={busy || !file || !title.trim()}>{busy ? 'Uploading…' : 'Add document'}</Button></div>
      </form>
    </Modal>
  );
}

function ApprovedLink({ link, organization, onClose }: { link: { url: string; email: string; name: string; expiresAt: string }; organization: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const mail = `mailto:${encodeURIComponent(link.email)}?subject=${encodeURIComponent(`${organization} security documents`)}&body=${encodeURIComponent(
    `Hi ${link.name.split(' ')[0]},\n\nHere is your link to our security documents. It works until ${link.expiresAt.slice(0, 10)}:\n\n${link.url}\n\nPlease keep them confidential, as agreed when you requested access.`)}`;
  return (
    <Modal title="Access approved" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">Send this personal link to {link.name}. It is shown only now and works until {formatDate(link.expiresAt)}. Downloads are recorded in the activity log.</p>
        <p className="break-all rounded-lg border border-slate-800 bg-slate-950 p-3 font-mono text-xs text-slate-300">{link.url}</p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={async () => { await navigator.clipboard.writeText(link.url).catch(() => undefined); setCopied(true); }}>
            {copied ? <Check size={15} /> : <Copy size={15} />} Copy link
          </Button>
          <a href={mail} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"><Mail size={15} /> Email it</a>
        </div>
      </div>
    </Modal>
  );
}
