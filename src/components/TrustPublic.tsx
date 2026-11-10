'use client';

import { BadgeCheck, CheckCircle2, Download, FileText, Lock, Mail, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { trustPageData } from '@/trust/public';
import { api, Button, ErrorText, Field, formatDate, inputCls, Modal } from './ui';

type Data = NonNullable<Awaited<ReturnType<typeof trustPageData>>>;

const size = (n: number) => (n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function TrustPublic({ data }: { data: Data }) {
  const [requesting, setRequesting] = useState(false);
  const [sent, setSent] = useState(false);
  const hasPrivate = data.documents.some(d => d.access !== 'public');

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-800 bg-slate-900/60">
        <div className="mx-auto max-w-5xl px-6 py-12 md:py-16">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-400"><ShieldCheck size={15} /> {data.organization} Trust Center</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-50 md:text-4xl">{data.headline}</h1>
          <p className="mt-3 max-w-3xl whitespace-pre-line text-slate-400">{data.description}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            {hasPrivate && !sent && <Button onClick={() => setRequesting(true)}><Lock size={15} /> Request access to documents</Button>}
            {sent && <p className="flex items-center gap-2 text-sm text-emerald-400"><CheckCircle2 size={16} /> Request sent. You&apos;ll receive a link by email once it&apos;s approved.</p>}
            {data.contactEmail && (
              <a href={`mailto:${data.contactEmail}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">
                <Mail size={15} /> {data.contactEmail}
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-12 px-6 py-12">
        {data.frameworks.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Compliance</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.frameworks.map(f => (
                <div key={f.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <BadgeCheck className="mt-0.5 shrink-0 text-sky-400" />
                  <div>
                    <p className="font-semibold text-slate-100">{f.name}</p>
                    {f.status && <p className="text-sm text-slate-400">{f.status}</p>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.practices.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Security practices</h2>
            <p className="mt-1 text-sm text-slate-500">Verified by automated checks of our systems{data.practicesCheckedAt ? `, last on ${formatDate(data.practicesCheckedAt)}` : ''}.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {data.practices.map(p => (
                <div key={p.id} className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-400" size={20} />
                  <div>
                    <p className="font-medium text-slate-100">{p.title}</p>
                    <p className="text-sm text-slate-400">{p.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {data.documents.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Documents</h2>
            <ul className="mt-4 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/60">
              {data.documents.map(d => (
                <li key={d.id} className="flex items-center gap-4 px-5 py-4">
                  <FileText size={18} className="shrink-0 text-sky-400" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-100">{d.title}</p>
                    {d.description && <p className="text-xs text-slate-500">{d.description}</p>}
                  </div>
                  {d.access === 'public' ? (
                    <a href={`/api/trust/documents/${d.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
                      <Download size={13} /> Download · {size(d.fileSize)}
                    </a>
                  ) : (
                    <button onClick={() => !sent && setRequesting(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800">
                      <Lock size={13} /> {sent ? 'Requested' : 'Request access'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.policies.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Policies</h2>
            <p className="mt-1 text-sm text-slate-500">Written policies that everyone at {data.organization} follows.</p>
            <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {data.policies.map(p => (
                <li key={p.title} className="flex items-center gap-2 text-sm text-slate-300">
                  <CheckCircle2 size={14} className="shrink-0 text-emerald-400" /> {p.title}
                  {p.updatedAt && <span className="text-xs text-slate-500">· {formatDate(p.updatedAt)}</span>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-6 pb-10 text-xs text-slate-600">Powered by ControlLayer</footer>

      {requesting && <RequestForm ndaText={data.ndaText} onClose={() => setRequesting(false)} onSent={() => { setRequesting(false); setSent(true); }} />}
    </div>
  );
}

function RequestForm({ ndaText, onClose, onSent }: { ndaText: string; onClose: () => void; onSent: () => void }) {
  const [f, setF] = useState({ name: '', email: '', company: '', reason: '', website: '' });
  const [nda, setNda] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal title="Request access" onClose={onClose}>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        setError('');
        try {
          await api('/api/trust/requests', { method: 'POST', json: { ...f, ndaAccepted: nda } });
          onSent();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}>
        <Field label="Full name"><input className={inputCls} required value={f.name} onChange={set('name')} autoComplete="name" /></Field>
        <Field label="Work email"><input className={inputCls} required type="email" value={f.email} onChange={set('email')} autoComplete="email" /></Field>
        <Field label="Company"><input className={inputCls} required value={f.company} onChange={set('company')} autoComplete="organization" /></Field>
        <Field label="Why do you need access? (optional)"><textarea className={`${inputCls} h-20`} value={f.reason} onChange={set('reason')} /></Field>
        <input type="text" name="website" tabIndex={-1} autoComplete="off" value={f.website} onChange={set('website')} className="hidden" aria-hidden="true" />
        <label className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400">
          <input type="checkbox" className="mt-0.5" checked={nda} onChange={e => setNda(e.target.checked)} />
          <span>{ndaText}</span>
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end"><Button type="submit" disabled={busy || !nda}>{busy ? 'Sending…' : 'Send request'}</Button></div>
      </form>
    </Modal>
  );
}
