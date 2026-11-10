'use client';

import { AlertTriangle, Apple, Check, CheckCircle2, Copy, Laptop, MonitorSmartphone, Plus, Server, Terminal } from 'lucide-react';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatDate, inputBase, inputCls, Modal, PageHeader } from './ui';

const OS_LABEL: Record<string, string> = { linux: 'Linux', windows: 'Windows', macos: 'macOS' };
const DAY = 86_400_000;

export default function DevicesTab({ data, refresh }: TabProps) {
  const canEdit = data.user.role !== 'auditor';
  const isAdmin = data.user.role === 'admin';
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<'all' | 'server' | 'workstation' | 'issues'>('all');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const devices = data.devices;
  const isSample = devices.some(d => d.isSample);
  const people = new Map(data.policies.people.map(p => [p.email, p]));

  const list = useMemo(() => devices.filter(d =>
    filter === 'all' ? true : filter === 'issues' ? d.failing.length > 0 : d.role === filter), [devices, filter]);
  const servers = devices.filter(d => d.role === 'server').length;
  const withIssues = devices.filter(d => d.failing.length).length;

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Devices"
        subtitle="Servers and laptops, on-premises or anywhere else. A small read-only script on each machine reports disk encryption, firewall, updates, malware protection, screen lock, remote login and local accounts."
        actions={isAdmin && <Button onClick={() => setAdding(true)}><Plus size={15} /> Add a device</Button>}
      />
      <ErrorText>{error}</ErrorText>
      {isSample && <p className="text-sm text-amber-300">These are the sample company&apos;s devices. Your own devices appear here once they report.</p>}

      {devices.length === 0 ? (
        <Card className="p-8">
          <Empty icon={MonitorSmartphone} title="No devices yet">
            Run the ControlLayer agent on your servers and laptops. It takes one command per machine{isAdmin ? '' : '; ask an admin for it'}.
            {isAdmin && <div className="mt-4"><Button onClick={() => setAdding(true)}><Plus size={15} /> Add a device</Button></div>}
          </Empty>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Devices</p><p className="mt-1 text-2xl font-bold text-slate-100">{devices.length}</p><p className="text-xs text-slate-500">{servers} server{servers === 1 ? '' : 's'}, {devices.length - servers} workstation{devices.length - servers === 1 ? '' : 's'}</p></Card>
            <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">With issues</p><p className={cx('mt-1 text-2xl font-bold', withIssues ? 'text-red-400' : 'text-emerald-400')}>{withIssues}</p><p className="text-xs text-slate-500">Fix them under Findings.</p></Card>
            <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Not reported this week</p><p className="mt-1 text-2xl font-bold text-slate-100">{devices.filter(d => Date.now() - Date.parse(d.lastSeenAt) > 7 * DAY).length}</p><p className="text-xs text-slate-500">Schedule the agent to run daily.</p></Card>
          </div>

          <div className="flex flex-wrap gap-2">
            {([['all', 'All'], ['server', 'Servers'], ['workstation', 'Workstations'], ['issues', 'With issues']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)}
                className={cx('rounded-lg px-3 py-2 text-sm font-medium', filter === id ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-slate-800')}>{label}</button>
            ))}
          </div>

          <Card className="divide-y divide-slate-800">
            {list.map(d => {
              const Icon = d.role === 'server' ? Server : d.os === 'macos' ? Apple : Laptop;
              const stale = Date.now() - Date.parse(d.lastSeenAt) > 7 * DAY;
              const owner = d.owner ? people.get(d.owner) : null;
              return (
                <div key={d.id}>
                  <button onClick={() => setOpen(open === d.id ? null : d.id)} className="flex w-full flex-col gap-2 px-5 py-4 text-left hover:bg-slate-800/40 md:flex-row md:items-center md:gap-4">
                    <Icon size={18} className="hidden shrink-0 text-sky-400 md:block" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-100">{d.hostname}</p>
                      <p className="truncate text-xs text-slate-500">{d.osVersion} · {d.role}{d.owner ? ` · ${owner?.name ?? d.owner}` : ''}{d.ip ? ` · ${d.ip}` : ''}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className={stale ? 'text-amber-300' : 'text-slate-500'}>Reported {formatDate(d.lastSeenAt, true)}</span>
                      {d.failing.length
                        ? <span className="flex items-center gap-1 font-semibold text-red-400"><AlertTriangle size={13} /> {d.failing.length} issue{d.failing.length === 1 ? '' : 's'}</span>
                        : d.passing ? <span className="flex items-center gap-1 font-semibold text-emerald-400"><CheckCircle2 size={13} /> All checks pass</span>
                        : <span className="text-slate-500">Not checked yet</span>}
                    </div>
                  </button>
                  {open === d.id && (
                    <div className="space-y-4 border-t border-slate-800 bg-slate-950/40 px-5 py-4 text-sm">
                      {d.failing.length > 0 ? (
                        <ul className="space-y-1.5">
                          {d.failing.map(f => <li key={`${f.checkId}${f.message}`} className="text-slate-300"><span className="font-medium text-red-300">{f.title}:</span> {f.message.replace(`${d.hostname}: `, '')}</li>)}
                        </ul>
                      ) : <p className="text-slate-400">{d.passing ? `${d.passing} checks pass.` : 'Results appear a few minutes after the device reports.'}</p>}
                      {canEdit && !d.isSample && (
                        <div className="flex flex-wrap items-end gap-3">
                          <Field label="Role">
                            <select className={cx(inputBase, 'w-40')} value={d.role} disabled={busy}
                              onChange={e => run(() => api(`/api/devices/${d.id}`, { method: 'PATCH', json: { role: e.target.value } }))}>
                              <option value="server">Server</option><option value="workstation">Workstation</option>
                            </select>
                          </Field>
                          <OwnerField id={d.id} owner={d.owner} people={data.policies.people.filter(p => p.active).map(p => ({ email: p.email, name: p.name }))} onSaved={refresh} />
                          {isAdmin && <Button size="sm" variant="ghost" disabled={busy}
                            onClick={() => confirm(`Remove ${d.hostname}? It comes back if its agent reports again.`) && run(() => api(`/api/devices/${d.id}`, { method: 'DELETE' }))}>Remove</Button>}
                        </div>
                      )}
                      <p className="text-xs text-slate-500">Agent {d.agentVersion} · first seen {formatDate(d.firstSeenAt)}</p>
                    </div>
                  )}
                </div>
              );
            })}
            {list.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing here.</p>}
          </Card>
        </>
      )}

      {adding && <AddDevice localInstall={data.features.localInstall} canStoreKeys={data.features.canStoreKeys} people={data.policies.people.filter(p => p.active).map(p => p.email)} onClose={() => setAdding(false)} />}
    </div>
  );
}

function OwnerField({ id, owner, people, onSaved }: { id: string; owner: string | null; people: { email: string; name: string }[]; onSaved: () => void }) {
  const [value, setValue] = useState(owner ?? '');
  const [error, setError] = useState('');
  return (
    <Field label="Used by">
      <div className="flex gap-2">
        <input className={cx(inputBase, 'w-64')} list={`owners-${id}`} value={value} placeholder="email (laptops)" onChange={e => setValue(e.target.value)} />
        <datalist id={`owners-${id}`}>{people.map(p => <option key={p.email} value={p.email}>{p.name}</option>)}</datalist>
        {value !== (owner ?? '') && (
          <Button size="sm" variant="secondary" onClick={async () => {
            try { await api(`/api/devices/${id}`, { method: 'PATCH', json: { owner: value } }); setError(''); onSaved(); } catch (e) { setError((e as Error).message); }
          }}>Save</Button>
        )}
      </div>
      {error && <span className="text-xs text-red-300">{error}</span>}
    </Field>
  );
}

type Platform = 'linux' | 'macos' | 'windows';

/** Pure: the one-line install command for a platform. */
export function agentCommand(platform: Platform, origin: string, key: string, opts: { role: string; owner: string; schedule: boolean }) {
  if (platform === 'windows') {
    return `& ([scriptblock]::Create((irm '${origin}/api/devices/agent/controllayer-agent.ps1'))) -Url '${origin}' -Key '${key}'`
      + `${opts.role ? ` -Role ${opts.role}` : ''}${opts.owner ? ` -Owner '${opts.owner}'` : ''}${opts.schedule ? ' -Schedule' : ''}`;
  }
  return `curl -fsSL ${origin}/api/devices/agent/controllayer-agent.sh | sudo bash -s -- --url ${origin} --key ${key}`
    + `${opts.role ? ` --role ${opts.role}` : ''}${opts.owner ? ` --owner ${opts.owner}` : ''}${opts.schedule ? ' --schedule' : ''}`;
}

function AddDevice({ localInstall, canStoreKeys, people, onClose }: { localInstall: boolean; canStoreKeys: boolean; people: string[]; onClose: () => void }) {
  const browserOrigin = useSyncExternalStore(() => () => undefined, () => window.location.origin, () => '');
  const [origin, setOrigin] = useState<string | null>(null);
  const [platform, setPlatform] = useState<Platform>('linux');
  const [role, setRole] = useState('');
  const [owner, setOwner] = useState('');
  const [schedule, setSchedule] = useState(true);
  const [key, setKey] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const address = origin ?? browserOrigin;
  const loopback = /\/\/(127\.0\.0\.1|localhost|\[::1\])(:|$)/.test(address);

  useEffect(() => {
    api<{ key: string | null }>('/api/devices/key').then(r => setKey(r.key)).catch(e => { setKey(null); setError((e as Error).message); });
  }, []);

  const command = key ? agentCommand(platform, address, key, { role, owner, schedule }) : '';

  return (
    <Modal title="Add a device" onClose={onClose} wide>
      <div className="space-y-5">
        <p className="text-sm text-slate-400">
          Run this command on each server or laptop. The script only reads settings and sends them here; with &ldquo;Run every day&rdquo; it also adds a daily job.
          The machine must be able to reach this ControlLayer address.
        </p>

        {key === null ? (
          <div className="space-y-3 rounded-xl border border-slate-800 p-4 text-sm">
            <p className="text-slate-300">First, create the device key that machines use to send their reports.</p>
            {!canStoreKeys && <ErrorText>Unavailable: the server has no CONTROLLAYER_SECRET_KEY to encrypt the key with.</ErrorText>}
            <Button disabled={!canStoreKeys} onClick={async () => {
              try { setKey((await api<{ key: string }>('/api/devices/key', { method: 'POST' })).key); } catch (e) { setError((e as Error).message); }
            }}>Create device key</Button>
          </div>
        ) : key && (
          <>
            <div className="flex gap-1 rounded-lg bg-slate-950 p-1 text-sm">
              {(['linux', 'macos', 'windows'] as const).map(p => (
                <button key={p} onClick={() => setPlatform(p)} className={cx('flex-1 rounded-md py-1.5', platform === p ? 'bg-slate-800 font-medium text-slate-100' : 'text-slate-400')}>
                  {OS_LABEL[p]}
                </button>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Role">
                <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
                  <option value="">Automatic</option><option value="server">Server</option><option value="workstation">Workstation (laptop / desktop)</option>
                </select>
              </Field>
              <Field label="Used by (optional)">
                <input className={inputCls} list="device-owners" value={owner} onChange={e => setOwner(e.target.value.trim())} placeholder="name@company.com" />
                <datalist id="device-owners">{people.map(p => <option key={p} value={p} />)}</datalist>
              </Field>
              <label className="flex items-center gap-2 pt-7 text-sm text-slate-300">
                <input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} /> Run every day
              </label>
            </div>
            <Field label="ControlLayer address the machine uses" hint={loopback ? 'This address only works on this computer. Enter one other machines can reach, e.g. http://192.168.1.20:3210.' : undefined}>
              <input className={cx(inputCls, loopback && 'border-amber-500/60')} value={address} onChange={e => setOrigin(e.target.value.replace(/\/+$/, ''))} />
            </Field>
            {loopback && localInstall && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                In the desktop app, turn on network access first (ControlLayer menu &gt; Network Settings…, then restart). The menu shows this computer&apos;s network address.
              </p>
            )}
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <div className="flex items-center justify-between border-b border-slate-800 px-3 py-1.5 text-xs text-slate-500">
                <span className="flex items-center gap-2"><Terminal size={12} /> {platform === 'windows' ? 'PowerShell (Run as Administrator)' : 'Terminal'}</span>
                <button className="flex items-center gap-1 text-slate-400 hover:text-slate-200" onClick={async () => {
                  await navigator.clipboard.writeText(command).catch(() => undefined);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}>{copied ? <Check size={12} /> : <Copy size={12} />} Copy</button>
              </div>
              <pre className="whitespace-pre-wrap break-all p-3 font-mono text-xs leading-relaxed text-slate-200">{command}</pre>
            </div>
            <ul className="list-inside list-disc space-y-1 text-xs text-slate-500">
              <li>The device appears on this page right away; its checks update within about 10 minutes.</li>
              <li>To roll out to many machines, run the same command with your usual tools (Group Policy, Intune, Jamf, Ansible, SSH loops).</li>
              <li>The key only lets a machine send reports. Keep it private anyway; you can replace it below.</li>
              {platform !== 'windows' && <li>To see what would be sent without sending it, add <code className="text-slate-300">--print</code>.</li>}
              {platform === 'windows' && <li>To see what would be sent without sending it, add <code className="text-slate-300">-Print</code>.</li>}
            </ul>
            <div className="flex justify-between border-t border-slate-800 pt-4">
              <Button variant="ghost" size="sm" onClick={async () => {
                if (!confirm('Replace the device key? Machines set up with the old key stop reporting until you run the new command on them.')) return;
                try { setKey((await api<{ key: string }>('/api/devices/key', { method: 'POST' })).key); } catch (e) { setError((e as Error).message); }
              }}>Replace key</Button>
              <Button onClick={onClose}>Done</Button>
            </div>
          </>
        )}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
