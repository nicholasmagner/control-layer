'use client';

import { Clock, Download, Eye, FileText, Fingerprint, FolderArchive, Image as ImageIcon, Search, ShieldAlert, ShieldCheck, StickyNote, Upload } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { TabProps } from './AppShell';
import { api, Button, Card, cx, Empty, ErrorText, Field, formatBytes, formatDate, ImagePreview, inputBase, inputCls, isPreviewableImage, PageHeader, Pill } from './ui';

interface Verification {
  ok: boolean; checked: number; legacy: number; head: string | null; problem?: { seq: number; reason: string };
  anchors: { count: number; valid: number; latest: { genTime: string; tsaUrl: string } | null; problem?: { seq: number; reason: string } };
}

const KIND_FILTERS: Record<string, (k: string) => boolean> = {
  all: () => true,
  documents: k => k === 'upload' || k === 'note',
  images: k => k === 'snapshot',
  data: k => k === 'automated',
};

const day = (d: Date) => d.toISOString().slice(0, 10);

export default function EvidenceTab({ data, frameworkId, openUpload }: TabProps) {
  const canEdit = data.user.role !== 'auditor';
  const today = new Date();
  const [exportFw, setExportFw] = useState(frameworkId);
  const [from, setFrom] = useState(day(new Date(today.getTime() - 365 * 86_400_000)));
  const [to, setTo] = useState(day(today));
  const [verify, setVerify] = useState<Verification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  const [showLog, setShowLog] = useState(false);
  const [preview, setPreview] = useState<{ id: string; title: string } | null>(null);

  const fwNames = Object.fromEntries(data.frameworks.map(f => [f.id, f.shortName]));
  const list = useMemo(() => data.evidence.filter(e =>
    KIND_FILTERS[kind](e.kind) &&
    (!query || `${e.title} ${e.fileName ?? ''} ${e.controls.map(c => c.controlId).join(' ')}`.toLowerCase().includes(query.toLowerCase()))),
  [data.evidence, kind, query]);

  async function runVerify() {
    setVerifying(true);
    setVerifyError('');
    try {
      setVerify(await api<Verification>('/api/evidence/verify'));
    } catch (err) {
      setVerifyError((err as Error).message);
    } finally {
      setVerifying(false);
    }
  }

  const exportHref = `/api/evidence/export?${new URLSearchParams({ framework: exportFw, from, to })}`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Evidence & Audits"
        subtitle="Everything your auditor needs: scan results collected automatically, your uploaded documents, and a tamper-evident record of both."
        actions={canEdit && <Button onClick={() => openUpload()}><Upload size={16} /> Add evidence</Button>}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start gap-3">
            <FolderArchive className="mt-0.5 shrink-0 text-sky-400" />
            <div>
              <h3 className="font-semibold text-slate-100">Audit evidence package</h3>
              <p className="mt-1 text-sm text-slate-400">
                A ZIP organized by control, with a status summary, findings, the activity log, an evidence index and SHA-256 fingerprints for every file. Send it to your auditor, or invite them as a read-only user to download it themselves.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            <Field label="Framework">
              <select className={inputCls} value={exportFw} onChange={e => setExportFw(e.target.value)}>
                {data.frameworks.map(f => <option key={f.id} value={f.id}>{f.shortName}</option>)}
              </select>
            </Field>
            <Field label="Period from"><input type="date" className={inputCls} value={from} max={to} onChange={e => setFrom(e.target.value)} /></Field>
            <Field label="Period to"><input type="date" className={inputCls} value={to} min={from} onChange={e => setTo(e.target.value)} /></Field>
            <div className="flex items-end">
              <a href={exportHref} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500">
                <Download size={16} /> Download ZIP
              </a>
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Scan results collected within the period are included. Documents count if they were current during the period (within each control&apos;s review window).
          </p>
        </Card>

        <Card className="p-6">
          <div className="flex items-start gap-3">
            <Fingerprint className="mt-0.5 shrink-0 text-sky-400" />
            <div>
              <h3 className="font-semibold text-slate-100">Integrity check</h3>
              <p className="mt-1 text-sm text-slate-400">Every record is fingerprinted when collected and chained to the one before it. Any later edit or deletion shows up here.</p>
            </div>
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-slate-950/60 p-3 text-xs text-slate-400">
            <Clock size={14} className="mt-0.5 shrink-0 text-sky-400" />
            {!data.timestamps.enabled ? <span>Independent timestamps are off (TIMESTAMP_AUTHORITY_URL=off).</span>
              : data.timestamps.latest ? (
                <span>Independently timestamped by <span className="text-slate-200">{data.timestamps.authority}</span>: latest {formatDate(data.timestamps.latest.genTime, true)}, covering records 1–{data.timestamps.latest.seq} ({data.timestamps.count} timestamp{data.timestamps.count === 1 ? '' : 's'}).</span>
              ) : <span>Records are timestamped by <span className="text-slate-200">{data.timestamps.authority}</span> after your first real scan or upload.</span>}
          </div>
          <Button className="mt-4 w-full" variant="secondary" onClick={runVerify} disabled={verifying}>{verifying ? 'Verifying…' : 'Verify all evidence'}</Button>
          <ErrorText>{verifyError}</ErrorText>
          {verify && (
            <div className={cx('mt-4 rounded-lg border p-3 text-sm', verify.ok ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-red-500/25 bg-red-500/10 text-red-300')}>
              <p className="flex items-center gap-2 font-semibold">
                {verify.ok ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                {verify.ok ? `${verify.checked} record(s) verified` : `Problem at record #${(verify.problem ?? verify.anchors.problem)?.seq}`}
              </p>
              {!verify.ok && <p className="mt-1">{(verify.problem ?? verify.anchors.problem)?.reason}</p>}
              {verify.anchors.count > 0 && <p className="mt-1 text-xs opacity-80">{verify.anchors.valid} of {verify.anchors.count} independent timestamp(s) valid.</p>}
              {verify.legacy > 0 && <p className="mt-1 text-xs opacity-80">{verify.legacy} older record(s) predate fingerprinting.</p>}
              {verify.head && <p className="mt-2 break-all font-mono text-[10px] opacity-70">Chain head: {verify.head}</p>}
            </div>
          )}
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="mr-auto font-semibold text-slate-100">Evidence library <span className="text-sm font-normal text-slate-500">({data.evidenceTotal})</span></h3>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input className={cx(inputBase, 'w-64 pl-8')} placeholder="Search title or control" value={query} onChange={e => setQuery(e.target.value)} />
          </div>
          <select className={cx(inputBase, 'w-auto')} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="all">All evidence</option>
            <option value="documents">Documents &amp; notes</option>
            <option value="images">Evidence images</option>
            <option value="data">Scan data records</option>
          </select>
        </div>

        {list.length === 0 ? (
          <Empty icon={FileText} title="No evidence yet">Run a scan to collect evidence automatically, or upload policies and other documents.</Empty>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-500">
                <tr><th className="px-4 py-3">Evidence</th><th className="px-4 py-3">Controls</th><th className="px-4 py-3">Collected</th><th className="px-4 py-3">Fingerprint</th><th className="px-4 py-3" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {list.map(e => (
                  <tr key={e.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {e.kind === 'note' ? <StickyNote size={14} className="shrink-0 text-amber-400" />
                          : e.kind === 'snapshot' ? <ImageIcon size={14} className="shrink-0 text-emerald-400" />
                          : <FileText size={14} className={cx('shrink-0', e.kind === 'upload' ? 'text-sky-400' : 'text-slate-500')} />}
                        <span className="font-medium text-slate-200">{e.title}</span>
                        {e.isSample && <Pill className="text-amber-300">sample</Pill>}
                      </div>
                      <p className="ml-6 text-xs text-slate-500">{e.fileName ? `${e.fileName} · ${formatBytes(e.fileSize)}` : e.kind === 'automated' ? e.description : 'Written note'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {e.controls.slice(0, 6).map(c => <Pill key={`${c.framework}${c.controlId}`}>{fwNames[c.framework]} {c.controlId}</Pill>)}
                        {e.controls.length > 6 && <Pill>+{e.controls.length - 6}</Pill>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">{formatDate(e.collectedAt, true)}<br /><span className="text-slate-600">{e.collectedBy}</span></td>
                    <td className="px-4 py-3 font-mono text-[11px] text-slate-500" title={e.sha256 ?? ''}>{e.sha256 ? `${e.sha256.slice(0, 12)}…` : '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {isPreviewableImage(e.mimeType) && (
                        <button onClick={() => setPreview({ id: e.id, title: e.title })} className="mr-3 text-slate-400 hover:text-sky-400" title="View"><Eye size={16} /></button>
                      )}
                      <a href={`/api/evidence/${e.id}`} className="text-slate-400 hover:text-sky-400" title="Download"><Download size={16} /></a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.evidenceTotal > data.evidence.length && <p className="px-4 py-3 text-xs text-slate-500">Showing the latest {data.evidence.length}. The audit package includes everything in the selected period.</p>}
          </Card>
        )}
      </section>

      <section>
        <button onClick={() => setShowLog(!showLog)} className="font-semibold text-slate-100 hover:text-sky-400">
          {showLog ? '▾' : '▸'} Activity log <span className="text-sm font-normal text-slate-500">(who did what, when)</span>
        </button>
        {showLog && (
          <Card className="mt-3 divide-y divide-slate-800">
            {data.events.map(e => (
              <div key={e.id} className="grid gap-1 px-4 py-2.5 text-sm md:grid-cols-[170px_1fr_auto]">
                <span className="text-xs text-slate-500">{formatDate(e.timestamp, true)}</span>
                <span className="text-slate-300">{e.action}{e.resource ? ` · ${e.resource}` : ''}{e.reason ? <span className="block text-xs text-slate-500">{e.reason}</span> : null}</span>
                <span className="text-xs text-slate-500">{e.actor}</span>
              </div>
            ))}
          </Card>
        )}
      </section>
      {preview && <ImagePreview id={preview.id} title={preview.title} onClose={() => setPreview(null)} />}
    </div>
  );
}
