'use client';

import { Upload } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import type { AppData } from '@/lib/data';
import { Button, cx, ErrorText, Field, formatBytes, inputCls, Modal } from './ui';

export default function UploadEvidenceModal({ data, frameworkId, preselected, onClose, onDone }: {
  data: AppData;
  frameworkId: string;
  preselected: string[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set(preselected));
  const [fwFilter, setFwFilter] = useState(frameworkId);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const allControls = useMemo(() => data.frameworks.flatMap(f => f.controls.filter(c => c.id).map(c => ({ ...c, fwName: f.shortName }))), [data.frameworks]);
  const list = allControls.filter(c => c.framework === fwFilter &&
    (!query || `${c.controlId} ${c.title}`.toLowerCase().includes(query.toLowerCase())));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData();
    form.set('title', title);
    form.set('description', description);
    selected.forEach(id => form.append('controlIds', id));
    if (file) form.set('file', file);
    try {
      const res = await fetch('/api/evidence', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Upload failed.');
      onDone();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal title="Add evidence" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title">
            <input className={inputCls} required maxLength={200} placeholder="e.g. Information Security Policy v3" value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label="File (optional, up to 25 MB)" hint="Policies, screenshots, exports, signed reviews…">
            <label className={cx(inputCls, 'flex cursor-pointer items-center gap-2 text-slate-400')}>
              <Upload size={14} />
              <span className="truncate">{file ? `${file.name} (${formatBytes(file.size)})` : 'Choose a file'}</span>
              <input type="file" className="hidden" onChange={e => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && !title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
              }} />
            </label>
          </Field>
        </div>
        <Field label={file ? 'Notes (optional)' : 'Note'} hint={file ? undefined : 'Without a file, describe the evidence, e.g. how and when a review was done.'}>
          <textarea className={inputCls} rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-300">Supports controls <span className="text-slate-500">({selected.size} selected)</span></span>
            <div className="flex gap-2">
              <select className={cx(inputCls, 'w-auto py-1.5 text-xs')} value={fwFilter} onChange={e => setFwFilter(e.target.value)}>
                {data.frameworks.map(f => <option key={f.id} value={f.id}>{f.shortName}</option>)}
              </select>
              <input className={cx(inputCls, 'w-40 py-1.5 text-xs')} placeholder="Filter" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
          <div className="max-h-56 space-y-0.5 overflow-y-auto rounded-lg border border-slate-800 p-2">
            {list.map(c => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-slate-800/60">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-sky-500" />
                <span className="w-24 shrink-0 font-mono text-xs text-sky-400">{c.controlId}</span>
                <span className="truncate text-slate-300">{c.title}</span>
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">One document can support controls in several frameworks; switch frameworks above to add more.</p>
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || selected.size === 0 || !title.trim() || (!file && !description.trim())}>
            {busy ? 'Saving…' : 'Save evidence'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
