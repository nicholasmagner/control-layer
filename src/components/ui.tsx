'use client';

import { AlertCircle, CheckCircle2, CircleDashed, MinusCircle, X, XCircle } from 'lucide-react';
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react';

export function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

/** fetch wrapper: JSON in/out, throws Error(message) on failure. */
export async function api<T = Record<string, unknown>>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const res = await fetch(path, {
    ...rest,
    headers: json !== undefined ? { 'Content-Type': 'application/json', ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error || `Request failed (${res.status}).`);
  return body as T;
}

export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60',
        size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
        variant === 'primary' && 'bg-sky-600 hover:bg-sky-500 text-white',
        variant === 'secondary' && 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700',
        variant === 'ghost' && 'text-slate-300 hover:bg-slate-800',
        variant === 'danger' && 'bg-red-600/90 hover:bg-red-500 text-white',
        className,
      )}
    />
  );
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx('rounded-xl border border-slate-800 bg-slate-900/60', className)}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-50">{title}</h2>
        {subtitle && <p className="mt-1 text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

const STATUS_STYLES: Record<string, { cls: string; Icon: typeof CheckCircle2 }> = {
  'Met': { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25', Icon: CheckCircle2 },
  'Partially Met': { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/25', Icon: AlertCircle },
  'Not Met': { cls: 'bg-red-500/10 text-red-400 border-red-500/25', Icon: XCircle },
  'Needs Evidence': { cls: 'bg-slate-500/10 text-slate-300 border-slate-500/25', Icon: CircleDashed },
  'Not assessed': { cls: 'bg-slate-500/10 text-slate-400 border-slate-500/25', Icon: CircleDashed },
  'Not Applicable': { cls: 'bg-slate-700/30 text-slate-500 border-slate-600/30', Icon: MinusCircle },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES['Not assessed'];
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold', s.cls)}>
      <s.Icon size={12} /> {status}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/25'
    : severity === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
    : 'bg-sky-500/10 text-sky-400 border-sky-500/25';
  return <span className={cx('rounded border px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide', cls)}>{severity}</span>;
}

export function Pill({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('rounded bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-300', className)}>{children}</span>;
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={cx('max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-800 bg-slate-900 px-6 py-4">
          <h3 className="text-lg font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200" aria-label="Close"><X size={18} /></button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

export const inputBase = 'rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 outline-none focus:border-sky-500';
export const inputCls = `${inputBase} w-full`;

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{children}</p>;
}

export function Empty({ icon: Icon, title, children }: { icon: typeof CheckCircle2; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 px-6 py-14 text-center">
      <Icon className="mb-3 text-slate-600" size={36} />
      <p className="font-medium text-slate-300">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function formatDate(iso: string | null | undefined, withTime = false) {
  if (!iso) return '—';
  const d = new Date(iso);
  return withTime
    ? d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatBytes(n: number | null | undefined) {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const PROVIDER_LABEL: Record<string, string> = { aws: 'AWS', gcp: 'Google Cloud', azure: 'Azure', gworkspace: 'Google Workspace', m365: 'Microsoft 365', github: 'GitHub' };

export const isPreviewableImage = (mime: string | null | undefined) =>
  !!mime && ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(mime);

export function ImagePreview({ id, title, onClose }: { id: string; title: string; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose} wide>
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated evidence, not a static asset */}
      <img src={`/api/evidence/${id}?view=1`} alt={title} className="w-full rounded-lg border border-slate-800" />
      <div className="mt-4 flex justify-end">
        <a href={`/api/evidence/${id}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700">
          Download original
        </a>
      </div>
    </Modal>
  );
}
