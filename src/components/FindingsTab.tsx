'use client';

import { AlertTriangle, CheckCircle2, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { FindingView } from '@/lib/data';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatDate, inputBase, inputCls, Modal, PageHeader, Pill, PROVIDER_LABEL, SeverityBadge } from './ui';

const STATUSES = ['Open', 'Accepted', 'Resolved'] as const;
const SEVERITY_RANK: Record<string, number> = { High: 0, Medium: 1, Low: 2 };

export default function FindingsTab({ data, refresh, navigate }: TabProps) {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('Open');
  const [provider, setProvider] = useState('all');
  const [selected, setSelected] = useState<FindingView | null>(null);

  const list = useMemo(() => data.findings
    .filter(f => f.status === status && (provider === 'all' || f.provider === provider))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.createdAt.localeCompare(a.createdAt)),
  [data.findings, status, provider]);

  const counts = Object.fromEntries(STATUSES.map(s => [s, data.findings.filter(f => f.status === s).length]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Findings"
        subtitle="Misconfigurations found by scans. They close automatically when a later scan sees them fixed."
        actions={<Button variant="secondary" onClick={() => navigate('connectors')}>Run a scan</Button>}
      />

      <div className="flex flex-wrap items-center gap-2">
        {STATUSES.map(s => (
          <button key={s} onClick={() => setStatus(s)}
            className={cx('rounded-lg px-3 py-2 text-sm font-medium', status === s ? 'bg-sky-500/15 text-sky-400' : 'text-slate-400 hover:bg-slate-800')}>
            {s === 'Accepted' ? 'Risk accepted' : s} <span className="ml-1 text-xs opacity-70">{counts[s]}</span>
          </button>
        ))}
        <select className={cx(inputBase, 'ml-auto w-auto')} value={provider} onChange={e => setProvider(e.target.value)}>
          <option value="all">All sources</option>
          {Object.entries(PROVIDER_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {list.length === 0 ? (
        <Empty icon={status === 'Open' ? CheckCircle2 : AlertTriangle} title={status === 'Open' ? 'No open findings' : `No ${status.toLowerCase()} findings`}>
          {status === 'Open' && 'Run a scan from Integrations to check your environment.'}
        </Empty>
      ) : (
        <Card className="divide-y divide-slate-800 overflow-hidden">
          {list.map(f => (
            <button key={f.id} onClick={() => setSelected(f)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-slate-800/30">
              <SeverityBadge severity={f.severity} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-200">{f.title}</span>
                <span className="block truncate text-xs text-slate-500">{f.description}</span>
              </span>
              <Pill>{PROVIDER_LABEL[f.provider ?? ''] ?? 'Other'}</Pill>
              <span className="hidden w-28 text-right text-xs text-slate-500 md:block">{formatDate(f.status === 'Resolved' ? f.resolvedAt : f.createdAt)}</span>
            </button>
          ))}
        </Card>
      )}

      {selected && <FindingModal finding={selected} canEdit={data.user.role !== 'auditor'} isAdmin={data.user.role === 'admin'}
        remediation={data.features.remediation} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); refresh(); }} />}
    </div>
  );
}

function FindingModal({ finding: f, canEdit, isAdmin, remediation, onClose, onChanged }: {
  finding: FindingView; canEdit: boolean; isAdmin: boolean; remediation: boolean; onClose: () => void; onChanged: () => void;
}) {
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'view' | 'accept' | 'fix'>('view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const canFix = remediation && isAdmin && !f.isSample && f.checkId === 'aws.iam_user_mfa' && f.status === 'Open' && !f.mitigation;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      await api(`/api/findings/${f.id}`, { method: 'PATCH', json: body });
      onChanged();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  async function applyFix() {
    setBusy(true);
    setError('');
    try {
      const r = await api<{ message: string }>('/api/findings/remediate', { method: 'POST', json: { findingId: f.id } });
      setMessage(r.message);
      setMode('view');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title={f.title} onClose={message ? onChanged : onClose} wide>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={f.severity} />
          <Pill>{PROVIDER_LABEL[f.provider ?? ''] ?? 'Other'}</Pill>
          <Pill>{f.status === 'Accepted' ? 'Risk accepted' : f.status}</Pill>
          {f.controls.map(c => <Pill key={c} className="text-sky-400">{c}</Pill>)}
        </div>
        <p className="text-slate-200">{f.description}</p>
        <dl className="grid gap-3 rounded-lg bg-slate-950/60 p-4 text-sm md:grid-cols-2">
          <div><dt className="text-xs text-slate-500">Resource</dt><dd className="break-all font-mono text-xs text-slate-300">{f.resource}</dd></div>
          <div><dt className="text-xs text-slate-500">First found</dt><dd className="text-slate-300">{formatDate(f.createdAt, true)}</dd></div>
          {f.resolvedAt && <div><dt className="text-xs text-slate-500">Resolved</dt><dd className="text-slate-300">{formatDate(f.resolvedAt, true)}</dd></div>}
          {f.acceptReason && <div className="md:col-span-2"><dt className="text-xs text-slate-500">Risk accepted by {f.acceptedBy}</dt><dd className="text-slate-300">{f.acceptReason}</dd></div>}
          {f.mitigation && <div className="md:col-span-2"><dt className="text-xs text-slate-500">Mitigation applied</dt><dd className="text-slate-300">{f.mitigation}</dd></div>}
        </dl>
        {f.remediation && (
          <div>
            <h4 className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">How to fix</h4>
            <p className="whitespace-pre-wrap rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm leading-relaxed text-emerald-50">{f.remediation}</p>
          </div>
        )}

        {message && <p className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-sm text-emerald-300">{message}</p>}

        {mode === 'accept' && (
          <Field label="Why is this risk acceptable?" hint="Recorded with your name and included in the audit package.">
            <textarea className={inputCls} rows={3} value={reason} onChange={e => setReason(e.target.value)}
              placeholder="e.g. Public bucket hosts marketing images only; reviewed by CTO, revisit in 6 months." />
          </Field>
        )}
        {mode === 'fix' && (
          <div className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold">This changes your AWS account.</p>
            <p>ControlLayer will attach an inline IAM policy to this user that blocks everything except setting up MFA until they sign in with MFA. They may lose access to tools until they do. The change is recorded in the activity log and as evidence.</p>
          </div>
        )}

        <ErrorText>{error}</ErrorText>

        {canEdit && !message && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-4">
            {mode === 'view' && f.status === 'Open' && (
              <>
                {canFix && <Button variant="secondary" onClick={() => setMode('fix')}><Wrench size={14} /> Apply fix in AWS…</Button>}
                <Button variant="secondary" onClick={() => setMode('accept')}>Accept risk…</Button>
              </>
            )}
            {mode === 'view' && f.status !== 'Open' && <Button variant="secondary" disabled={busy} onClick={() => act({ action: 'reopen' })}>Reopen</Button>}
            {mode === 'accept' && (
              <>
                <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
                <Button disabled={busy || reason.trim().length < 5} onClick={() => act({ action: 'accept', reason })}>Accept risk</Button>
              </>
            )}
            {mode === 'fix' && (
              <>
                <Button variant="ghost" onClick={() => setMode('view')}>Cancel</Button>
                <Button variant="danger" disabled={busy} onClick={applyFix}>{busy ? 'Applying…' : 'Yes, change AWS'}</Button>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
