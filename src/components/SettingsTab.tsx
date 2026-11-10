'use client';

import { Bot, Building2, Check, KeyRound, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, ErrorText, Field, formatDate, inputBase, inputCls, PageHeader } from './ui';

const ROLE_HELP: Record<string, string> = {
  admin: 'Everything, including users and settings',
  member: 'Run scans, upload evidence, manage findings and controls',
  auditor: 'Read-only: view everything and download evidence packages',
};

export default function SettingsTab({ data, refresh }: TabProps) {
  const isAdmin = data.user.role === 'admin';
  return (
    <div className="space-y-8">
      <PageHeader title="Settings" subtitle={isAdmin ? 'Changes apply immediately for everyone in this workspace.' : 'Only admins can change workspace settings.'} />
      <WorkspaceSettings data={data} refresh={refresh} />
      <AssistantSettings data={data} refresh={refresh} />
      {isAdmin && <Users data={data} refresh={refresh} />}
      <ChangePassword userId={data.user.id} />
    </div>
  );
}

const SCAN_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Off (scan when you click Scan now)' },
  { value: 6, label: 'Every 6 hours' },
  { value: 12, label: 'Every 12 hours' },
  { value: 24, label: 'Every day' },
  { value: 168, label: 'Every week' },
];

function useSave(refresh: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function save(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await api('/api/settings', { method: 'PUT', json: body });
      setSaved(true);
      refresh();
      setTimeout(() => setSaved(false), 2500);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, saved, save };
}

function SavedNote({ show }: { show: boolean }) {
  return show ? <span className="flex items-center gap-1 text-sm text-emerald-400"><Check size={14} /> Saved</span> : null;
}

function FromEnv({ source }: { source: string }) {
  return source === 'environment' ? <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">from server settings</span> : null;
}

function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)}
      className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', checked ? 'bg-sky-600' : 'bg-slate-700')}>
      <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
    </button>
  );
}

function WorkspaceSettings({ data, refresh }: Pick<TabProps, 'data' | 'refresh'>) {
  const s = data.settings;
  const canEdit = data.user.role === 'admin';
  const [form, setForm] = useState({
    organizationName: s.organizationName,
    scanIntervalHours: s.scanIntervalHours ?? 0,
    snapshotIntervalDays: s.snapshotIntervalDays,
    timestampsEnabled: s.timestampsEnabled,
    timestampAuthorityUrl: s.timestampAuthorityUrl,
    remediationEnabled: s.remediationEnabled,
  });
  const { busy, error, saved, save } = useSave(refresh);
  const dirty = form.organizationName !== s.organizationName || form.scanIntervalHours !== (s.scanIntervalHours ?? 0)
    || form.snapshotIntervalDays !== s.snapshotIntervalDays || form.timestampsEnabled !== s.timestampsEnabled
    || form.timestampAuthorityUrl !== s.timestampAuthorityUrl || form.remediationEnabled !== s.remediationEnabled;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (form.remediationEnabled && !s.remediationEnabled
      && !confirm('Turning on the one-click AWS fix lets admins change IAM policies in your AWS account from ControlLayer. Continue?')) return;
    // Only send what changed, so untouched settings keep following the server's defaults.
    const initial: Record<string, unknown> = { organizationName: s.organizationName, scanIntervalHours: s.scanIntervalHours ?? 0, snapshotIntervalDays: s.snapshotIntervalDays, timestampsEnabled: s.timestampsEnabled, timestampAuthorityUrl: s.timestampAuthorityUrl, remediationEnabled: s.remediationEnabled };
    const changed = Object.fromEntries(Object.entries(form).filter(([k, v]) => v !== initial[k]));
    if (changed.timestampAuthorityUrl !== undefined || changed.timestampsEnabled !== undefined) {
      changed.timestampsEnabled = form.timestampsEnabled;
      changed.timestampAuthorityUrl = form.timestampAuthorityUrl;
    }
    await save(changed);
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-6">
        <div className="flex items-center gap-2"><Building2 size={18} className="text-sky-400" /><h3 className="font-semibold text-slate-100">Workspace</h3></div>

        <Field label="Organization name" hint="Shown in the app and on every audit evidence package.">
          <input className={inputCls} value={form.organizationName} maxLength={120} disabled={!canEdit} required
            onChange={e => setForm({ ...form, organizationName: e.target.value })} />
        </Field>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Automatic scans" hint="Scans every connected cloud account on this schedule while ControlLayer is running.">
            <select className={inputCls} value={form.scanIntervalHours} disabled={!canEdit}
              onChange={e => setForm({ ...form, scanIntervalHours: Number(e.target.value) })}>
              {SCAN_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <Field label="Fresh evidence image every (days)" hint="When nothing changes. A new image is also made whenever a result changes.">
            <input className={inputCls} type="number" min={1} max={365} value={form.snapshotIntervalDays} disabled={!canEdit}
              onChange={e => setForm({ ...form, snapshotIntervalDays: Number(e.target.value) })} />
          </Field>
        </div>

        <div className="space-y-3 rounded-xl border border-slate-800 p-4">
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-200">Independent timestamps<FromEnv source={s.sources.timestampAuthorityUrl} /></p>
              <p className="text-xs text-slate-500">After each scan or upload, a public timestamp service certifies the evidence fingerprint. Only the fingerprint is sent, never your evidence.</p>
            </div>
            <Toggle label="Independent timestamps" checked={form.timestampsEnabled} disabled={!canEdit} onChange={v => setForm({ ...form, timestampsEnabled: v })} />
          </div>
          {form.timestampsEnabled && (
            <Field label="Timestamp authority (RFC 3161)">
              <input className={inputCls} value={form.timestampAuthorityUrl} disabled={!canEdit} onChange={e => setForm({ ...form, timestampAuthorityUrl: e.target.value })} />
            </Field>
          )}
        </div>

        <div className="flex items-start gap-4 rounded-xl border border-slate-800 p-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-slate-200">One-click AWS fix<FromEnv source={s.sources.remediationEnabled} /></p>
            <p className="text-xs text-slate-500">Lets admins apply a &quot;require MFA&quot; policy to an AWS user from a finding. This is the only feature that changes a cloud account, and it needs the iam:PutUserPolicy permission.</p>
          </div>
          <Toggle label="One-click AWS fix" checked={form.remediationEnabled} disabled={!canEdit} onChange={v => setForm({ ...form, remediationEnabled: v })} />
        </div>

        {canEdit && (
          <div className="flex items-center justify-end gap-3">
            <SavedNote show={saved} />
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy || !dirty}>{busy ? 'Saving…' : 'Save changes'}</Button>
          </div>
        )}
      </form>
    </Card>
  );
}

function AssistantSettings({ data, refresh }: Pick<TabProps, 'data' | 'refresh'>) {
  const a = data.settings.assistant;
  const canEdit = data.user.role === 'admin';
  const [key, setKey] = useState('');
  const [model, setModel] = useState(a.model ?? '');
  const [models, setModels] = useState<string[]>([]);
  const { busy, error, saved, save } = useSave(refresh);

  useEffect(() => {
    if (!canEdit || !a.configured) return;
    api<{ models: string[] }>('/api/settings').then(r => setModels(r.models)).catch(() => undefined);
  }, [canEdit, a.configured, a.keyHint]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { assistantModel: model };
    if (key.trim()) body.assistantApiKey = key.trim();
    if (await save(body)) setKey('');
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="space-y-5">
        <div className="flex items-center gap-2">
          <Bot size={18} className="text-sky-400" />
          <h3 className="font-semibold text-slate-100">Assistant</h3>
          <span className={cx('ml-2 rounded-full border px-2 py-0.5 text-xs font-semibold', a.configured ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-400')}>
            {a.configured ? 'On' : 'Off'}
          </span>
        </div>
        <p className="text-sm text-slate-400">
          Optional. Explains why a control passes or fails, suggests next steps and drafts audit narrative, using only your ControlLayer data.
          It can only read and answer; pass/fail always comes from the checks. Uses an Anthropic API key
          (<a className="text-sky-400 hover:text-sky-300" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">get one here</a>).
        </p>

        {canEdit ? (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={a.configured ? `API key (saved: ${a.keyHint})` : 'API key'} hint={a.configured ? 'Paste a new key to replace the saved one.' : 'Checked before saving, then stored encrypted.'}>
                <input className={inputCls} type="password" autoComplete="off" spellCheck={false} placeholder={a.configured ? 'Leave empty to keep the saved key' : 'sk-ant-…'}
                  value={key} onChange={e => setKey(e.target.value)} disabled={!data.features.canStoreKeys} />
              </Field>
              <Field label="Model (optional)" hint="Leave on automatic to use a recommended model your key can access.">
                <select className={inputCls} value={model} onChange={e => setModel(e.target.value)} disabled={!a.configured && !key}>
                  <option value="">Automatic</option>
                  {model && !models.includes(model) && <option value={model}>{model}</option>}
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
            </div>
            {!data.features.canStoreKeys && <ErrorText>This server cannot store keys safely because CONTROLLAYER_SECRET_KEY is not set.</ErrorText>}
            <div className="flex items-center justify-end gap-3">
              <SavedNote show={saved} />
              <ErrorText>{error}</ErrorText>
              {a.configured && (
                <Button type="button" variant="ghost" disabled={busy} onClick={() => { if (confirm('Remove the API key and turn the assistant off?')) save({ assistantApiKey: null }); }}>
                  Remove key
                </Button>
              )}
              <Button type="submit" disabled={busy || (!key.trim() && model === (a.model ?? ''))}>{busy ? 'Checking key…' : a.configured ? 'Save' : 'Check key and turn on'}</Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">{a.configured ? 'The assistant is on.' : 'Ask an admin to add an API key.'}</p>
        )}
      </form>
    </Card>
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
