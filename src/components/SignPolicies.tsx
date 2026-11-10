'use client';

import { CheckCircle2, ChevronDown, ChevronRight, FileText } from 'lucide-react';
import { useState } from 'react';
import { api, Button, ErrorText, formatDate, inputCls } from './ui';

interface SignPolicy {
  versionId: string;
  title: string;
  summary: string;
  version: number;
  publishedAt: string;
  acceptedAt: string | null;
  html: string;
}

export default function SignPolicies({ token, organization, person, policies: initial }: {
  token: string;
  organization: string;
  person: { name: string; email: string };
  policies: SignPolicy[];
}) {
  const [policies, setPolicies] = useState(initial);
  const pending = policies.filter(p => !p.acceptedAt);
  const [open, setOpen] = useState<string | null>(pending[0]?.versionId ?? null);
  const [read, setRead] = useState<Set<string>>(new Set(pending[0] ? [pending[0].versionId] : []));
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: string) => {
    setOpen(open === id ? null : id);
    setRead(new Set(read).add(id));
  };

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await api(`/api/sign/${encodeURIComponent(token)}`, { method: 'POST', json: { signedName: name, versionIds: pending.map(p => p.versionId) } });
      const now = new Date().toISOString();
      setPolicies(policies.map(p => (p.acceptedAt ? p : { ...p, acceptedAt: now })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const allRead = pending.every(p => read.has(p.versionId));

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 md:py-12">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-400">{organization}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-50">Company policies</h1>
        <p className="mt-1 text-sm text-slate-400">
          Hi {person.name}. Please read each policy below and confirm that you have read, understood and will follow it.
        </p>
      </header>

      {policies.length === 0 && <p className="text-sm text-slate-400">There are no policies to review right now.</p>}

      <div className="space-y-3">
        {policies.map(p => (
          <section key={p.versionId} className="rounded-xl border border-slate-800 bg-slate-900/60">
            <button onClick={() => toggle(p.versionId)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
              {open === p.versionId ? <ChevronDown size={18} className="text-slate-500" /> : <ChevronRight size={18} className="text-slate-500" />}
              <FileText size={18} className="text-sky-400" />
              <span className="flex-1">
                <span className="block font-medium text-slate-100">{p.title}</span>
                <span className="block text-xs text-slate-500">Version {p.version} · {formatDate(p.publishedAt)}</span>
              </span>
              {p.acceptedAt
                ? <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400"><CheckCircle2 size={14} /> Accepted {formatDate(p.acceptedAt)}</span>
                : read.has(p.versionId) ? <span className="text-xs text-slate-400">Opened</span> : <span className="text-xs text-amber-400">To read</span>}
            </button>
            {open === p.versionId && (
              <div className="policy-doc border-t border-slate-800 px-6 py-5" dangerouslySetInnerHTML={{ __html: p.html }} />
            )}
          </section>
        ))}
      </div>

      {pending.length > 0 ? (
        <section className="space-y-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
          {!allRead && <p className="text-sm text-amber-300">Open each policy above to read it before accepting.</p>}
          <label className="flex items-start gap-3 text-sm text-slate-300">
            <input type="checkbox" className="mt-1" checked={agree} onChange={e => setAgree(e.target.checked)} disabled={!allRead} />
            <span>I have read and understood the {pending.length === 1 ? 'policy' : `${pending.length} policies`} above and agree to follow {pending.length === 1 ? 'it' : 'them'}.</span>
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-300">Type your full name to sign</span>
            <input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder={person.name} autoComplete="name" />
          </label>
          <ErrorText>{error}</ErrorText>
          <Button onClick={submit} disabled={busy || !agree || !allRead || name.trim().length < 2}>
            {busy ? 'Saving…' : `Accept ${pending.length === 1 ? 'policy' : `${pending.length} policies`}`}
          </Button>
          <p className="text-xs text-slate-500">Your name, the time and your IP address are recorded with the exact version of each policy.</p>
        </section>
      ) : policies.length > 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5 text-sm text-emerald-300">
          <CheckCircle2 size={18} /> You&apos;re all set. Thank you! You can close this page.
        </p>
      )}
    </main>
  );
}
