'use client';

import { CheckCircle2, Cloud, FlaskConical, Play, Plug, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { TabProps } from './AppShell';
import ConnectModal from './ConnectModal';
import { api, Button, Card, cx, ErrorText, formatDate, PageHeader } from './ui';

interface ScanSummary { ok: boolean; error?: string; checksEvaluated: number; passed: number; failed: number; newFindings: number; resolvedFindings: number; warnings: string[] }

const METHOD_LABEL: Record<string, string> = { signin: 'Browser sign-in', keys: 'Read-only key', env: 'Server settings' };

export default function ConnectorsTab({ data, refresh }: TabProps) {
  const canEdit = data.user.role !== 'auditor';
  const isAdmin = data.user.role === 'admin';
  const [connecting, setConnecting] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ScanSummary>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sampleBusy, setSampleBusy] = useState(false);

  async function scan(provider: string) {
    setRunning(provider);
    setErrors(e => ({ ...e, [provider]: '' }));
    try {
      const res = await fetch('/api/scans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) });
      const body = await res.json();
      if (body.ok) setResults(r => ({ ...r, [provider]: body }));
      else setErrors(e => ({ ...e, [provider]: body.error ?? 'Scan failed.' }));
      refresh();
    } catch (err) {
      setErrors(e => ({ ...e, [provider]: (err as Error).message }));
    } finally {
      setRunning(null);
    }
  }

  async function disconnect(provider: string, name: string) {
    if (!confirm(`Disconnect ${name}? Past scans and evidence are kept.`)) return;
    await api(`/api/connectors/${provider}`, { method: 'DELETE' }).catch(err => setErrors(e => ({ ...e, [provider]: (err as Error).message })));
    refresh();
  }

  async function sample(method: 'POST' | 'DELETE') {
    setSampleBusy(true);
    try { await api('/api/sample-data', { method }); refresh(); } finally { setSampleBusy(false); }
  }

  const active = data.connectors.find(c => c.provider === connecting);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cloud accounts"
        subtitle={<>Connect each cloud once. Scans are <strong className="text-slate-300">read-only</strong>: ControlLayer never changes your cloud. {data.features.scanIntervalHours ? `Automatic scans run every ${data.features.scanIntervalHours} hour(s).` : ''}</>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {data.connectors.map(c => {
          const result = results[c.provider];
          const last = c.lastRun?.isSample ? null : c.lastRun;
          return (
            <Card key={c.provider} className="flex flex-col p-6">
              <div className="flex items-start justify-between">
                <div className={cx('rounded-xl p-3', c.configured ? 'bg-sky-500/15 text-sky-400' : 'bg-slate-800 text-slate-500')}><Cloud /></div>
                <span className={cx('rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  c.configured ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-400')}>
                  {c.configured ? 'Connected' : 'Not connected'}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-100">{c.name}</h3>

              {c.configured ? (
                <div className="mt-1 space-y-1 text-xs text-slate-500">
                  <p className="truncate text-sm text-slate-300" title={c.label ?? ''}>{c.label}</p>
                  <p>{c.target} · {METHOD_LABEL[c.method ?? 'env']}</p>
                </div>
              ) : (
                <p className="mt-1 text-sm text-slate-500">{c.checkCount} read-only checks. Takes about a minute to connect.</p>
              )}

              {c.configured && (
                <div className="mt-4 text-sm">
                  {last ? (
                    <p className="flex items-center gap-2 text-slate-400">
                      {last.status === 'error' ? <XCircle size={14} className="text-red-400" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
                      Last scan {formatDate(last.startedAt, true)}{last.status === 'partial' ? ' · some sections unreadable' : ''}
                    </p>
                  ) : <p className="text-slate-500">Not scanned yet.</p>}
                  {last?.status === 'error' && last.error && !errors[c.provider] && <p className="mt-2 break-words text-xs text-red-300">{last.error}</p>}
                </div>
              )}

              {errors[c.provider] && <div className="mt-3"><ErrorText>{errors[c.provider]}</ErrorText></div>}
              {result && (
                <div className="mt-3 rounded-lg bg-slate-950/60 p-3 text-xs text-slate-300">
                  <p>{result.checksEvaluated} checks · {result.passed} passing · <span className="text-red-400">{result.failed} failing</span></p>
                  <p className="text-slate-500">{result.newFindings} new findings · {result.resolvedFindings} resolved</p>
                  {result.warnings.length > 0 && (
                    <details className="mt-2 text-amber-300"><summary>{result.warnings.length} section(s) could not be read</summary>
                      <ul className="mt-1 list-inside list-disc text-amber-200/80">{result.warnings.map(w => <li key={w} className="break-words">{w}</li>)}</ul>
                    </details>
                  )}
                </div>
              )}

              <div className="mt-auto flex flex-col gap-2 pt-5">
                {c.configured ? (
                  <>
                    <Button className="w-full" disabled={!canEdit || !!running} onClick={() => scan(c.provider)}>
                      <Play size={14} /> {running === c.provider ? 'Scanning… (about a minute)' : 'Scan now'}
                    </Button>
                    {isAdmin && c.method !== 'env' && (
                      <div className="flex justify-center gap-4 text-xs">
                        <button className="text-slate-400 hover:text-slate-200" onClick={() => setConnecting(c.provider)}>Change connection</button>
                        <button className="text-slate-400 hover:text-red-300" onClick={() => disconnect(c.provider, c.name)}>Disconnect</button>
                      </div>
                    )}
                  </>
                ) : (
                  <Button className="w-full" disabled={!isAdmin} onClick={() => setConnecting(c.provider)} title={isAdmin ? undefined : 'Ask an admin to connect cloud accounts'}>
                    <Plug size={14} /> Connect
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {canEdit && (
        <Card className="flex flex-col gap-4 p-6 md:flex-row md:items-center">
          <FlaskConical className="shrink-0 text-amber-400" />
          <div className="flex-1">
            <h3 className="font-semibold text-slate-100">Sample data</h3>
            <p className="text-sm text-slate-400">Try every feature with a fictional company on AWS, Google Cloud and Azure. Sample data never mixes with real evidence and is removed by your first real scan.</p>
          </div>
          {data.features.hasSampleData
            ? <Button variant="secondary" disabled={sampleBusy} onClick={() => sample('DELETE')}>Clear sample data</Button>
            : <Button variant="secondary" disabled={sampleBusy} onClick={() => sample('POST')}>{sampleBusy ? 'Loading…' : 'Load sample data'}</Button>}
        </Card>
      )}

      {active && <ConnectModal info={active} features={data.features} onClose={() => { setConnecting(null); refresh(); }} onChanged={refresh} />}
    </div>
  );
}
