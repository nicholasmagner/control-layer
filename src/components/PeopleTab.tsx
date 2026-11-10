'use client';

import { Check, Copy, Link2, Mail, Upload, UserPlus, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { PersonView } from '@/policies/service';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatDate, inputBase, inputCls, Modal, PageHeader } from './ui';

type SignLink = { id: string; name: string; email: string; url: string };

export default function PeopleTab({ data, refresh, navigate }: TabProps) {
  const { people, policies } = data.policies;
  const canEdit = data.user.role !== 'auditor';
  const isAdmin = data.user.role === 'admin';
  const [filter, setFilter] = useState<'current' | 'pending' | 'left'>('current');
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [links, setLinks] = useState<SignLink[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const active = people.filter(p => p.active);
  const pending = active.filter(p => p.pending.length > 0);
  const signoffPolicies = policies.filter(p => p.latest && p.requiresSignoff).length;
  const directories = data.connectors.filter(c => (c.provider === 'gworkspace' || c.provider === 'm365') && c.configured);
  const [synced, setSynced] = useState('');
  const list = useMemo(() => people.filter(p => filter === 'left' ? !p.active : filter === 'pending' ? p.active && p.pending.length > 0 : p.active), [people, filter]);

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

  const makeLinks = (ids: string[]) => run(async () => {
    const res = await api<{ links: SignLink[] }>('/api/people/links', { method: 'POST', json: { personIds: ids } });
    setLinks(res.links);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="People"
        subtitle="Everyone who works for you: employees and contractors. Each person gets a personal link to read and accept your policies; no account needed."
        actions={canEdit && <>
          {directories.map(d => (
            <Button key={d.provider} variant="secondary" disabled={busy} onClick={() => run(async () => {
              const r = await api<{ added: number; skipped: number }>('/api/people/sync', { method: 'POST', json: { provider: d.provider } });
              setSynced(`${r.added} added from ${d.name}${r.skipped ? `; ${r.skipped} already listed, inactive or guests` : ''}.`);
            })}><Users size={15} /> Import from {d.name}</Button>
          ))}
          <Button variant="secondary" onClick={() => setImporting(true)}><Upload size={15} /> Import CSV</Button>
          <Button onClick={() => setAdding(true)}><UserPlus size={15} /> Add person</Button>
        </>}
      />
      <ErrorText>{error}</ErrorText>
      {synced && <p className="flex items-center gap-2 text-sm text-emerald-400"><Check size={15} /> {synced}</p>}

      {people.length === 0 ? (
        <Card className="p-8">
          <Empty icon={Users} title="No people yet">
            Add the people who work for you, one by one, from a CSV export of your HR or payroll system, or from Google Workspace or Microsoft 365 (connect them under Integrations). Auditors check that everyone accepted your policies and that people who left lost their access.
          </Empty>
        </Card>
      ) : (
        <>
          {signoffPolicies === 0 ? (
            <Card className="flex flex-wrap items-center gap-3 p-4 text-sm text-slate-400">
              <span className="flex-1">Publish policies that need sign-off, then send people their links.</span>
              <Button size="sm" variant="secondary" onClick={() => navigate('policies')}>Go to Policies</Button>
            </Card>
          ) : pending.length > 0 && canEdit && (
            <Card className="flex flex-wrap items-center gap-3 border-amber-500/30 p-4 text-sm">
              <span className="flex-1 text-amber-200">{pending.length} {pending.length === 1 ? 'person has' : 'people have'} policies to accept.</span>
              <Button size="sm" disabled={busy} onClick={() => makeLinks(pending.map(p => p.id))}><Link2 size={14} /> Get links for everyone pending</Button>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            {([['current', `Current (${active.length})`], ['pending', `Sign-off pending (${pending.length})`], ['left', `Left (${people.length - active.length})`]] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)}
                className={cx('rounded-lg px-3 py-2 text-sm font-medium', filter === id ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-slate-800')}>{label}</button>
            ))}
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-3 font-semibold">Person</th>
                  <th className="px-4 py-3 font-semibold">GitHub</th>
                  <th className="px-4 py-3 font-semibold">Policies</th>
                  <th className="px-4 py-3 font-semibold">{filter === 'left' ? 'Left' : 'Started'}</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {list.map(p => <PersonRow key={p.id} person={p} signoffPolicies={signoffPolicies} canEdit={canEdit} isAdmin={isAdmin} busy={busy}
                  onLink={() => makeLinks([p.id])}
                  onLeft={() => run(() => api(`/api/people/${p.id}`, { method: 'PATCH', json: { endDate: p.active ? new Date().toISOString().slice(0, 10) : null } }))}
                  onRemove={() => confirm(`Remove ${p.name} and their sign-off records? To keep the history, mark them as left instead.`) && run(() => api(`/api/people/${p.id}`, { method: 'DELETE' }))} />)}
                {list.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Nobody here.</td></tr>}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {adding && <AddPerson onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh(); }} />}
      {importing && <ImportPeople onClose={() => setImporting(false)} onDone={() => refresh()} />}
      {links && <LinksModal links={links} organization={data.organization} onClose={() => setLinks(null)} />}
    </div>
  );
}

function PersonRow({ person: p, signoffPolicies, canEdit, isAdmin, busy, onLink, onLeft, onRemove }: {
  person: PersonView; signoffPolicies: number; canEdit: boolean; isAdmin: boolean; busy: boolean;
  onLink: () => void; onLeft: () => void; onRemove: () => void;
}) {
  return (
    <tr className="align-top">
      <td className="px-4 py-3">
        <p className="font-medium text-slate-100">{p.name}</p>
        <p className="text-xs text-slate-500">{p.email}{p.title ? ` · ${p.title}` : ''}</p>
      </td>
      <td className="px-4 py-3 text-slate-400">{p.githubUsername ?? '—'}</td>
      <td className="px-4 py-3">
        {!p.active ? <span className="text-slate-500">—</span>
          : signoffPolicies === 0 ? <span className="text-slate-500">Nothing to sign</span>
          : p.pending.length === 0 ? <span className="flex items-center gap-1 text-emerald-400"><Check size={14} /> All accepted</span>
          : <span className="text-amber-300" title={p.pending.map(x => x.title).join('\n')}>{p.accepted}/{signoffPolicies} accepted</span>}
        {p.lastAcceptedAt && <p className="text-xs text-slate-500">Last {formatDate(p.lastAcceptedAt)}</p>}
      </td>
      <td className="px-4 py-3 text-slate-400">{formatDate(p.active ? p.startDate : p.endDate)}</td>
      <td className="px-4 py-3">
        {canEdit && (
          <div className="flex justify-end gap-1">
            {p.active && signoffPolicies > 0 && <Button size="sm" variant="secondary" disabled={busy} onClick={onLink}><Link2 size={13} /> Link</Button>}
            <Button size="sm" variant="ghost" disabled={busy} onClick={onLeft}>{p.active ? 'Mark as left' : 'Mark as current'}</Button>
            {isAdmin && <Button size="sm" variant="ghost" disabled={busy} onClick={onRemove}>Remove</Button>}
          </div>
        )}
      </td>
    </tr>
  );
}

function AddPerson({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ name: '', email: '', title: '', githubUsername: '', startDate: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });
  return (
    <Modal title="Add person" onClose={onClose}>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault();
        setBusy(true);
        try {
          await api('/api/people', { method: 'POST', json: form });
          onDone();
        } catch (err) {
          setError((err as Error).message);
          setBusy(false);
        }
      }}>
        <Field label="Full name"><input className={inputCls} value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Work email"><input className={inputCls} type="email" value={form.email} onChange={set('email')} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Job title (optional)"><input className={inputCls} value={form.title} onChange={set('title')} /></Field>
          <Field label="Start date (optional)"><input className={inputCls} type="date" value={form.startDate} onChange={set('startDate')} /></Field>
        </div>
        <Field label="GitHub username (optional)" hint="Used to check that people who left no longer have access to your GitHub organization.">
          <input className={inputCls} value={form.githubUsername} onChange={set('githubUsername')} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end"><Button type="submit" disabled={busy || !form.name || !form.email}>{busy ? 'Adding…' : 'Add person'}</Button></div>
      </form>
    </Modal>
  );
}

function ImportPeople({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<{ added: number; updated: number; errors: string[] } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Import people from CSV" onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          The first row must be a header with <code className="text-slate-300">name</code> and <code className="text-slate-300">email</code>.
          Optional columns: <code className="text-slate-300">title</code>, <code className="text-slate-300">github</code>, <code className="text-slate-300">start date</code>.
          People already in the list (same email) are updated.
        </p>
        <input type="file" accept=".csv,text/csv" className="text-sm text-slate-400" onChange={async e => {
          const f = e.target.files?.[0];
          if (f) setText(await f.text());
        }} />
        <textarea className={cx(inputBase, 'h-48 w-full font-mono text-xs')} value={text} onChange={e => setText(e.target.value)}
          placeholder={'name,email,title,github,start date\nJane Smith,jane@example.com,CTO,janesmith,2024-03-01'} />
        <ErrorText>{error}</ErrorText>
        {result && (
          <div className="rounded-lg border border-slate-800 p-3 text-sm text-slate-300">
            <p>{result.added} added, {result.updated} updated.</p>
            {result.errors.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-amber-300">{result.errors.map(e => <li key={e}>{e}</li>)}</ul>}
          </div>
        )}
        <div className="flex justify-end gap-2">
          {result ? <Button onClick={onClose}>Done</Button> : (
            <Button disabled={busy || !text.trim()} onClick={async () => {
              setBusy(true);
              setError('');
              try {
                setResult(await api('/api/people/import', { method: 'POST', json: { csv: text } }));
                onDone();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}>{busy ? 'Importing…' : 'Import'}</Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function LinksModal({ links, organization, onClose }: { links: SignLink[]; organization: string; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  };
  const mail = (l: SignLink) => `mailto:${encodeURIComponent(l.email)}?subject=${encodeURIComponent(`Please review ${organization} policies`)}&body=${encodeURIComponent(
    `Hi ${l.name.split(' ')[0]},\n\nPlease read and accept our company policies using your personal link:\n\n${l.url}\n\nIt takes about 10 minutes. Thank you!`)}`;
  return (
    <Modal title={links.length === 1 ? `Sign-off link for ${links[0].name}` : `Sign-off links (${links.length})`} onClose={onClose} wide>
      <div className="space-y-4">
        <p className="text-sm text-slate-400">
          Send each person their own link. Links are shown only now; making a new link replaces the old one.
          Anyone with the link can sign as that person, so send it only to them.
        </p>
        <div className="max-h-[50vh] space-y-2 overflow-y-auto">
          {links.map(l => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-200">{l.name} <span className="text-xs font-normal text-slate-500">{l.email}</span></p>
                <p className="truncate font-mono text-xs text-slate-500">{l.url}</p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => copy(l.id, l.url)}>{copied === l.id ? <Check size={13} /> : <Copy size={13} />} Copy</Button>
              <a href={mail(l)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"><Mail size={13} /> Email</a>
            </div>
          ))}
        </div>
        {links.length > 1 && (
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => copy('all', links.map(l => `${l.name}\t${l.email}\t${l.url}`).join('\n'))}>
              {copied === 'all' ? <Check size={15} /> : <Copy size={15} />} Copy all (for a spreadsheet)
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
