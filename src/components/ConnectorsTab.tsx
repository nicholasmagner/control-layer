'use client';

import { CheckCircle2, Cloud, ExternalLink, FlaskConical, Play, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, ErrorText, formatDate, PageHeader } from './ui';

interface ScanSummary { ok: boolean; error?: string; checksEvaluated: number; passed: number; failed: number; newFindings: number; resolvedFindings: number; warnings: string[]; checksSkipped: string[] }

export default function ConnectorsTab({ data, refresh }: TabProps) {
  const canEdit = data.user.role !== 'auditor';
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, ScanSummary | { error: string }>>({});
  const [sampleBusy, setSampleBusy] = useState(false);
  const [sampleError, setSampleError] = useState('');

  async function scan(provider: string) {
    setRunning(provider);
    setResults(r => ({ ...r, [provider]: undefined as never }));
    try {
      const res = await fetch('/api/scans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider }) });
      const body = await res.json();
      setResults(r => ({ ...r, [provider]: res.ok || body.error === undefined ? body : { error: body.error } }));
      refresh();
    } catch (err) {
      setResults(r => ({ ...r, [provider]: { error: (err as Error).message } }));
    } finally {
      setRunning(null);
    }
  }

  async function sample(method: 'POST' | 'DELETE') {
    setSampleBusy(true);
    setSampleError('');
    try {
      await api('/api/sample-data', { method });
      refresh();
    } catch (err) {
      setSampleError((err as Error).message);
    } finally {
      setSampleBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Cloud accounts"
        subtitle={<>Scans are <strong className="text-slate-300">read-only</strong>: ControlLayer reads configuration and never changes your cloud. {data.features.scanIntervalHours ? `Automatic scans run every ${data.features.scanIntervalHours} hour(s).` : 'Set SCAN_INTERVAL_HOURS to scan automatically.'}</>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {data.connectors.map(c => {
          const result = results[c.provider];
          const last = c.lastRun;
          return (
            <Card key={c.provider} className="flex flex-col p-6">
              <div className="flex items-start justify-between">
                <div className={cx('rounded-xl p-3', c.configured ? 'bg-sky-500/15 text-sky-400' : 'bg-slate-800 text-slate-500')}><Cloud /></div>
                <span className={cx('rounded-full border px-2.5 py-0.5 text-xs font-semibold',
                  c.configured ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400' : 'border-slate-700 bg-slate-800 text-slate-400')}>
                  {c.configured ? 'Configured' : 'Not configured'}
                </span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-slate-100">{c.name}</h3>
              <p className="text-xs text-slate-500">{c.target} · {c.checkCount} checks</p>

              <div className="mt-4 text-sm">
                {last ? (
                  <p className="flex items-center gap-2 text-slate-400">
                    {last.status === 'error' ? <XCircle size={14} className="text-red-400" /> : <CheckCircle2 size={14} className="text-emerald-400" />}
                    Last scan {formatDate(last.startedAt, true)}{last.isSample ? ' (sample)' : ''}{last.status === 'partial' ? ' · some sections unreadable' : ''}
                  </p>
                ) : <p className="text-slate-500">Never scanned.</p>}
                {last?.status === 'error' && last.error && <p className="mt-2 break-words text-xs text-red-300">{last.error}</p>}
              </div>

              {result && 'error' in result && result.error && last?.error !== result.error && <div className="mt-3"><ErrorText>{result.error}</ErrorText></div>}
              {result && 'ok' in result && result.ok && (
                <div className="mt-3 rounded-lg bg-slate-950/60 p-3 text-xs text-slate-300">
                  <p>{result.checksEvaluated} checks · {result.passed} passing · <span className="text-red-400">{result.failed} failing</span> resources</p>
                  <p className="text-slate-500">{result.newFindings} new findings · {result.resolvedFindings} resolved</p>
                  {result.warnings.length > 0 && (
                    <details className="mt-2 text-amber-300"><summary>{result.warnings.length} section(s) could not be read</summary>
                      <ul className="mt-1 list-inside list-disc text-amber-200/80">{result.warnings.map(w => <li key={w} className="break-words">{w}</li>)}</ul>
                    </details>
                  )}
                </div>
              )}

              <details className="mt-4 text-xs text-slate-400">
                <summary className="cursor-pointer text-slate-300">Setup instructions</summary>
                <div className="mt-2 space-y-2">
                  <p>Set these environment variables on the server, then restart:</p>
                  <ul className="space-y-1">{c.setup.env.map(e => <li key={e} className="rounded bg-slate-950 px-2 py-1 font-mono text-[11px]">{e}</li>)}</ul>
                  <p>{c.setup.permissions}</p>
                  <a href={c.setup.docs} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300">Provider docs <ExternalLink size={11} /></a>
                </div>
              </details>

              <div className="mt-auto pt-5">
                <Button className="w-full" disabled={!canEdit || !!running} onClick={() => scan(c.provider)}
                  variant={c.configured ? 'primary' : 'secondary'} title={canEdit ? undefined : 'Auditors cannot run scans'}>
                  <Play size={14} /> {running === c.provider ? 'Scanning… (can take a minute)' : 'Scan now'}
                </Button>
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
            <p className="text-sm text-slate-400">Load a fictional company with AWS, Google Cloud and Azure accounts to try every feature. Sample data never mixes with your real evidence and is removed by your first real scan.</p>
            <ErrorText>{sampleError}</ErrorText>
          </div>
          {data.features.hasSampleData
            ? <Button variant="secondary" disabled={sampleBusy} onClick={() => sample('DELETE')}>Clear sample data</Button>
            : <Button variant="secondary" disabled={sampleBusy} onClick={() => sample('POST')}>{sampleBusy ? 'Loading…' : 'Load sample data'}</Button>}
        </Card>
      )}
    </div>
  );
}
