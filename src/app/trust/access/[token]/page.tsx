import type { Metadata } from 'next';
import { Download, FileText, ShieldCheck } from 'lucide-react';
import { prisma } from '@/db/prisma';
import { loadTrustConfig } from '@/trust/config';
import { requestForToken } from '@/trust/public';
import { getSettings } from '@/lib/settings';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Security documents', robots: { index: false, follow: false } };

const size = (n: number) => (n < 1024 * 1024 ? `${Math.ceil(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

/** Personal page from an approved access link: every Trust Center document. */
export default async function TrustAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [config, request] = await Promise.all([loadTrustConfig(), requestForToken(token)]);
  if (!config.enabled || !request) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-100">This link has expired</h1>
        <p className="mt-2 text-sm text-slate-400">Request access again from the Trust Center, or contact the company that sent it.</p>
        <a href="/trust" className="mt-4 text-sm text-sky-400 hover:text-sky-300">Go to the Trust Center</a>
      </main>
    );
  }
  const [docs, settings] = await Promise.all([
    prisma.trustDocument.findMany({ orderBy: { createdAt: 'asc' }, select: { id: true, title: true, description: true, fileName: true, fileSize: true } }),
    getSettings(),
  ]);
  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 md:py-14">
      <header>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400"><ShieldCheck size={14} /> {settings.organizationName} Trust Center</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-50">Security documents</h1>
        <p className="mt-1 text-sm text-slate-400">
          Shared with {request.name} ({request.company}) under the confidentiality terms you accepted.
          This link works until {request.expiresAt!.toISOString().slice(0, 10)}.
        </p>
      </header>
      <ul className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-900/60">
        {docs.map(d => (
          <li key={d.id} className="flex items-center gap-4 px-5 py-4">
            <FileText size={18} className="shrink-0 text-sky-400" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-slate-100">{d.title}</p>
              <p className="truncate text-xs text-slate-500">{d.description ? `${d.description} · ` : ''}{d.fileName} · {size(d.fileSize)}</p>
            </div>
            <a href={`/api/trust/documents/${d.id}?token=${encodeURIComponent(token)}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700">
              <Download size={13} /> Download
            </a>
          </li>
        ))}
        {docs.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">No documents yet.</li>}
      </ul>
    </main>
  );
}
