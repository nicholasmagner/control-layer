'use client';

import { CheckCircle2, ChevronRight, Circle, Cloud, FlaskConical } from 'lucide-react';
import { useState } from 'react';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, ErrorText, formatDate, PageHeader, PROVIDER_LABEL, SeverityBadge, StatusBadge } from './ui';

const STATUS_ORDER = ['Met', 'Partially Met', 'Not Met', 'Needs Evidence', 'Not Applicable'] as const;
const STATUS_COLOR: Record<string, string> = {
  'Met': 'bg-emerald-500', 'Partially Met': 'bg-amber-500', 'Not Met': 'bg-red-500', 'Needs Evidence': 'bg-slate-500', 'Not Applicable': 'bg-slate-700',
};

function ScoreRing({ score }: { score: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const color = score >= 80 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <svg viewBox="0 0 120 120" className="h-36 w-36 -rotate-90">
      <circle cx="60" cy="60" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
      <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c - (score / 100) * c} className="transition-all duration-700" />
      <text x="60" y="60" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-slate-50 text-[26px] font-bold" style={{ transformOrigin: '60px 60px' }}>
        {score}%
      </text>
    </svg>
  );
}

export default function DashboardTab({ data, frameworkId, navigate, refresh, openUpload, setFramework }: TabProps) {
  const fw = data.frameworks.find(f => f.id === frameworkId)!;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const canEdit = data.user.role !== 'auditor';
  const open = data.findings.filter(f => f.status === 'Open');
  const scanned = data.connectors.some(c => c.lastRun && c.lastRun.status !== 'error');
  const applicable = fw.controls.filter(c => c.status !== 'Not Applicable').length;

  const attention = [...fw.controls]
    .filter(c => c.status === 'Not Met' || c.status === 'Partially Met' || c.status === 'Needs Evidence' || c.status === 'Not assessed')
    .sort((a, b) => ['Not Met', 'Partially Met', 'Needs Evidence', 'Not assessed'].indexOf(a.status) - ['Not Met', 'Partially Met', 'Needs Evidence', 'Not assessed'].indexOf(b.status))
    .slice(0, 6);

  const steps = [
    { done: scanned, label: 'Connect a cloud account (or load sample data)', action: () => navigate('connectors') },
    { done: data.evidence.some(e => e.kind === 'upload' || e.kind === 'note'), label: 'Upload policies and other evidence', action: () => openUpload() },
    { done: data.findings.some(f => f.status !== 'Open') || (scanned && open.length === 0), label: 'Fix or accept your first findings', action: () => navigate('findings') },
    { done: data.users.some(u => u.role === 'auditor'), label: 'Invite your auditor (read-only access)', action: () => navigate('settings'), hidden: data.user.role !== 'admin' },
    { done: data.events.some(e => e.action === 'Audit package exported'), label: 'Export an audit evidence package', action: () => navigate('evidence') },
  ].filter(s => !s.hidden);
  const allDone = steps.every(s => s.done);

  async function loadSample() {
    setLoading(true);
    setError('');
    try {
      await api('/api/sample-data', { method: 'POST' });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title={`${fw.name} readiness`} subtitle={fw.description} />

      {!scanned && canEdit && (
        <Card className="flex flex-col gap-4 border-sky-500/30 bg-sky-500/5 p-6 md:flex-row md:items-center">
          <FlaskConical className="shrink-0 text-sky-400" size={32} />
          <div className="flex-1">
            <p className="font-semibold text-slate-100">Welcome! Start by connecting a cloud account.</p>
            <p className="mt-1 text-sm text-slate-400">Or load a sample company (AWS, Google Cloud and Azure) to see how scans, findings and audit evidence work. Sample data is replaced by your first real scan.</p>
            <ErrorText>{error}</ErrorText>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate('connectors')}><Cloud size={16} /> Connect cloud</Button>
            <Button onClick={loadSample} disabled={loading}>{loading ? 'Loading…' : 'Load sample data'}</Button>
          </div>
        </Card>
      )}

      {data.settings.frameworks.length > 1 && (
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-100">All your frameworks</h3>
            <span className="text-xs text-slate-500">One piece of evidence counts everywhere it applies.</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.frameworks.filter(f => data.settings.frameworks.includes(f.id)).map(f => (
              <button key={f.id} onClick={() => setFramework(f.id)}
                className={cx('rounded-lg border p-3 text-left transition-colors hover:border-sky-500/50', f.id === frameworkId ? 'border-sky-500/60 bg-sky-500/5' : 'border-slate-800 bg-slate-950/40')}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-200">{f.shortName}</span>
                  <span className={cx('text-lg font-bold', f.score >= 80 ? 'text-emerald-400' : f.score >= 50 ? 'text-amber-400' : 'text-red-400')}>{f.score}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className={cx('h-full', f.score >= 80 ? 'bg-emerald-500' : f.score >= 50 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${f.score}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">{f.counts['Met'] ?? 0} of {f.controls.length - (f.counts['Not Applicable'] ?? 0)} controls met</p>
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="flex flex-col items-center gap-4 p-6 lg:col-span-1">
          <ScoreRing score={fw.score} />
          <p className="text-center text-sm text-slate-400">
            {fw.counts['Met'] ?? 0} of {applicable} applicable controls met
          </p>
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-800">
            {STATUS_ORDER.map(s => (fw.counts[s] ? <div key={s} className={STATUS_COLOR[s]} style={{ width: `${(fw.counts[s] / fw.controls.length) * 100}%` }} /> : null))}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 text-xs">
            {STATUS_ORDER.map(s => (
              <button key={s} onClick={() => navigate('controls')} className="flex items-center justify-between rounded-lg bg-slate-950/60 px-3 py-2 text-left hover:bg-slate-800">
                <span className="flex items-center gap-2 text-slate-400"><span className={cx('h-2 w-2 rounded-full', STATUS_COLOR[s])} />{s}</span>
                <span className="font-semibold text-slate-200">{fw.counts[s] ?? 0}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-100">Needs attention</h3>
            <button className="text-xs text-sky-400 hover:text-sky-300" onClick={() => navigate('controls')}>All controls →</button>
          </div>
          {attention.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Every applicable control is met. Keep evidence current and export your package when the audit starts.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {attention.map(c => (
                <li key={c.controlId}>
                  <button onClick={() => navigate('controls', { controlId: c.controlId })} className="flex w-full items-center gap-4 py-3 text-left hover:bg-slate-800/30">
                    <span className="w-24 shrink-0 font-mono text-xs text-sky-400">{c.controlId}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-slate-200">{c.title}</span>
                      <span className="block truncate text-xs text-slate-500">{c.justification}</span>
                    </span>
                    <StatusBadge status={c.status} />
                    <ChevronRight size={16} className="text-slate-600" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold text-slate-100">Open findings <span className="ml-1 text-sm font-normal text-slate-500">({open.length})</span></h3>
            <button className="text-xs text-sky-400 hover:text-sky-300" onClick={() => navigate('findings')}>All findings →</button>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3">
            {(['High', 'Medium', 'Low'] as const).map(s => (
              <div key={s} className="rounded-lg bg-slate-950/60 p-3">
                <p className="text-2xl font-bold text-slate-100">{open.filter(f => f.severity === s).length}</p>
                <p className="text-xs text-slate-500">{s} severity</p>
              </div>
            ))}
          </div>
          <ul className="divide-y divide-slate-800">
            {open.sort((a, b) => ['High', 'Medium', 'Low'].indexOf(a.severity) - ['High', 'Medium', 'Low'].indexOf(b.severity)).slice(0, 5).map(f => (
              <li key={f.id} className="flex items-center gap-3 py-2.5">
                <SeverityBadge severity={f.severity} />
                <span className="min-w-0 flex-1 truncate text-sm text-slate-300">{f.description}</span>
                <span className="text-xs text-slate-500">{PROVIDER_LABEL[f.provider ?? ''] ?? ''}</span>
              </li>
            ))}
            {open.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No open findings.</li>}
          </ul>
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 font-semibold text-slate-100">{allDone ? 'Audit readiness' : 'Getting started'}</h3>
          <ul className="space-y-2">
            {steps.map(s => (
              <li key={s.label}>
                <button onClick={s.action} className="flex w-full items-start gap-3 rounded-lg p-2 text-left text-sm hover:bg-slate-800/50">
                  {s.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-500" /> : <Circle size={18} className="mt-0.5 shrink-0 text-slate-600" />}
                  <span className={s.done ? 'text-slate-500 line-through' : 'text-slate-200'}>{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <h4 className="mb-2 mt-6 text-xs font-bold uppercase tracking-wider text-slate-500">Recent activity</h4>
          <ul className="space-y-2">
            {data.events.slice(0, 4).map(e => (
              <li key={e.id} className="text-xs">
                <span className="text-slate-300">{e.action}</span>
                <span className="text-slate-600"> · {formatDate(e.timestamp, true)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
