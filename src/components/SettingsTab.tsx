'use client';

import { KeyRound, Trash2, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { TabProps } from './AppShell';
import { api, Button, Card, ErrorText, Field, formatDate, inputBase, inputCls, PageHeader } from './ui';

const ROLE_HELP: Record<string, string> = {
  admin: 'Everything, including users and settings',
  member: 'Run scans, upload evidence, manage findings and controls',
  auditor: 'Read-only: view everything and download evidence packages',
};

export default function SettingsTab({ data, refresh }: TabProps) {
  const isAdmin = data.user.role === 'admin';
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" subtitle={`Workspace: ${data.organization}`} />
      {isAdmin && <Users data={data} refresh={refresh} />}
      <ChangePassword userId={data.user.id} />
      <Card className="p-6 text-sm text-slate-400">
        <h3 className="mb-2 font-semibold text-slate-100">Server configuration</h3>
        <ul className="space-y-1">
          <li>Organization name: <span className="text-slate-200">{data.organization}</span> <span className="text-slate-600">(ORGANIZATION_NAME)</span></li>
          <li>Automatic scans: <span className="text-slate-200">{data.features.scanIntervalHours ? `every ${data.features.scanIntervalHours} hour(s)` : 'off'}</span> <span className="text-slate-600">(SCAN_INTERVAL_HOURS)</span></li>
          <li>One-click AWS remediation: <span className="text-slate-200">{data.features.remediation ? 'on' : 'off'}</span> <span className="text-slate-600">(ENABLE_AWS_REMEDIATION)</span></li>
          <li>Assistant: <span className="text-slate-200">{data.features.assistant ? 'on' : 'off'}</span> <span className="text-slate-600">(ASSISTANT_API_KEY)</span></li>
        </ul>
      </Card>
    </div>
  );
}

function Users({ data, refresh }: Pick<TabProps, 'data' | 'refresh'>) {
  const [form, setForm] = useState({ name: '', email: '', role: 'member', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api('/api/users', { method: 'POST', json: form });
      setForm({ name: '', email: '', role: 'member', password: '' });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function update(id: string, body: Record<string, unknown>) {
    setError('');
    try {
      await api(`/api/users/${id}`, { method: 'PATCH', json: body });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(id: string, email: string) {
    if (!confirm(`Remove ${email}? They will lose access immediately.`)) return;
    try {
      await api(`/api/users/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card className="p-6">
      <h3 className="font-semibold text-slate-100">People</h3>
      <p className="mt-1 text-sm text-slate-400">Invite teammates, and give your auditor a read-only account so they can review controls and download evidence directly.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-slate-500"><tr><th className="py-2">Name</th><th>Role</th><th>Last sign-in</th><th /></tr></thead>
          <tbody className="divide-y divide-slate-800">
            {data.users.map(u => (
              <tr key={u.id}>
                <td className="py-2.5"><span className="text-slate-200">{u.name}</span><br /><span className="text-xs text-slate-500">{u.email}</span></td>
                <td>
                  <select className={`${inputBase} w-auto py-1 text-xs`} value={u.role} disabled={u.id === data.user.id}
                    onChange={e => update(u.id, { role: e.target.value })}>
                    <option value="admin">Admin</option><option value="member">Member</option><option value="auditor">Auditor</option>
                  </select>
                </td>
                <td className="text-xs text-slate-400">{formatDate(u.lastLoginAt, true)}</td>
                <td className="text-right">
                  {u.id !== data.user.id && (
                    <span className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" title="Reset password" onClick={() => {
                        const pw = prompt(`New password for ${u.email} (at least 12 characters):`);
                        if (pw) update(u.id, { password: pw });
                      }}><KeyRound size={14} /></Button>
                      <Button size="sm" variant="ghost" title="Remove" onClick={() => remove(u.id, u.email)}><Trash2 size={14} /></Button>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={add} className="mt-6 grid gap-3 border-t border-slate-800 pt-5 md:grid-cols-5">
        <Field label="Name"><input className={inputCls} required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email"><input className={inputCls} type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Role" hint={ROLE_HELP[form.role]}>
          <select className={inputCls} value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
            <option value="member">Member</option><option value="auditor">Auditor (read-only)</option><option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Initial password" hint="Share it with them securely.">
          <input className={inputCls} type="text" required minLength={12} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </Field>
        <div className="flex items-start pt-6"><Button type="submit" disabled={busy} className="w-full"><UserPlus size={14} /> Add</Button></div>
      </form>
      <div className="mt-3"><ErrorText>{error}</ErrorText></div>
    </Card>
  );
}

function ChangePassword({ userId }: { userId: string }) {
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await api(`/api/users/${userId}`, { method: 'PATCH', json: { password } });
      setPassword('');
      setMsg('Password updated.');
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <Card className="p-6">
      <h3 className="font-semibold text-slate-100">Your password</h3>
      <form onSubmit={submit} className="mt-3 flex max-w-md gap-2">
        <input className={inputCls} type="password" minLength={12} required autoComplete="new-password" placeholder="New password (12+ characters)"
          value={password} onChange={e => setPassword(e.target.value)} />
        <Button type="submit" variant="secondary">Update</Button>
      </form>
      {msg && <p className="mt-2 text-sm text-emerald-400">{msg}</p>}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>
    </Card>
  );
}
