'use client';

import { AlertTriangle, Bot, Cloud, FileText, FlaskConical, FolderArchive, LayoutDashboard, ListChecks, ClipboardList, LogOut, MonitorSmartphone, Settings, ShieldCheck, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { AppData } from '@/lib/data';
import AssistantTab from './AssistantTab';
import ConnectorsTab from './ConnectorsTab';
import ControlsTab from './ControlsTab';
import DashboardTab from './DashboardTab';
import DevicesTab from './DevicesTab';
import EvidenceTab from './EvidenceTab';
import FindingsTab from './FindingsTab';
import PeopleTab from './PeopleTab';
import PoliciesTab from './PoliciesTab';
import QuestionnairesTab from './QuestionnairesTab';
import SettingsTab from './SettingsTab';
import TrustTab from './TrustTab';
import UploadEvidenceModal from './UploadEvidenceModal';
import { api, Button, cx, FRAMEWORK_GROUPS } from './ui';

export type TabId = 'dashboard' | 'controls' | 'findings' | 'policies' | 'people' | 'devices' | 'evidence' | 'questionnaires' | 'trust' | 'connectors' | 'assistant' | 'settings';

export interface TabProps {
  data: AppData;
  frameworkId: string;
  navigate: (tab: TabId, opts?: { controlId?: string }) => void;
  refresh: () => void;
  openUpload: (controlIds?: string[]) => void;
  setFramework: (id: string) => void;
  focusControl?: string;
}

const TAB_IDS: TabId[] = ['dashboard', 'controls', 'findings', 'policies', 'people', 'devices', 'evidence', 'questionnaires', 'trust', 'connectors', 'assistant', 'settings'];

export default function AppShell({ data, initialTab, initialFramework }: { data: AppData; initialTab?: string; initialFramework?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<TabId>(TAB_IDS.includes(initialTab as TabId) ? (initialTab as TabId) : 'dashboard');
  const [frameworkId, setFrameworkId] = useState(
    data.frameworks.some(f => f.id === initialFramework) ? (initialFramework as string) : (data.settings.frameworks[0] ?? data.frameworks[0].id),
  );
  const [focusControl, setFocusControl] = useState<string | undefined>();
  const [upload, setUpload] = useState<string[] | null>(null);
  const canEdit = data.user.role !== 'auditor';

  // Keep the tab and framework in the URL so a reload returns to the same view.
  useEffect(() => {
    const params = new URLSearchParams({ tab, framework: frameworkId });
    window.history.replaceState(null, '', `?${params}`);
  }, [tab, frameworkId]);

  const navigate = useCallback((t: TabId, opts?: { controlId?: string }) => {
    setFocusControl(opts?.controlId);
    setTab(t);
    window.scrollTo({ top: 0 });
  }, []);
  const refresh = useCallback(() => router.refresh(), [router]);

  const nav: { id: TabId; label: string; icon: typeof LayoutDashboard; badge?: number; hidden?: boolean; section?: string }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'controls', label: 'Controls', icon: ListChecks },
    { id: 'findings', label: 'Findings', icon: AlertTriangle, badge: data.findings.filter(f => f.status === 'Open').length },
    { id: 'policies', label: 'Policies', icon: FileText, badge: data.policies.policies.filter(p => p.overdue).length, section: 'Program' },
    { id: 'people', label: 'People', icon: Users },
    { id: 'devices', label: 'Devices', icon: MonitorSmartphone, badge: data.devices.filter(d => d.failing.length).length },
    { id: 'questionnaires', label: 'Questionnaires', icon: ClipboardList, badge: data.questionnaires.filter(q => q.status !== 'completed' && q.dueDate && new Date(q.dueDate) < new Date()).length, section: 'Customers & auditors' },
    { id: 'trust', label: 'Trust Center', icon: ShieldCheck, badge: data.trust.requests.filter(r => r.status === 'pending').length },
    { id: 'evidence', label: 'Evidence & Audits', icon: FolderArchive },
    { id: 'connectors', label: 'Integrations', icon: Cloud, section: 'Setup' },
    { id: 'assistant', label: 'Assistant', icon: Bot, hidden: !data.features.assistant },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const props: TabProps = { data, frameworkId, navigate, refresh, openUpload: ids => setUpload(ids ?? []), setFramework: setFrameworkId, focusControl };

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/login';
  }

  return (
    <div className="flex min-h-screen w-full">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900 md:flex">
        <button className="px-6 pb-4 pt-6 text-left" onClick={() => navigate('dashboard')}>
          <h1 className="bg-gradient-to-r from-sky-400 to-blue-500 bg-clip-text text-2xl font-bold tracking-tight text-transparent">ControlLayer</h1>
          <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{data.organization}</p>
        </button>

        <div className="px-4">
          <label className="px-2 text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="framework">Framework</label>
          <select id="framework" value={frameworkId} onChange={e => setFrameworkId(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-500">
            {FRAMEWORK_GROUPS.map(g => {
              const list = data.frameworks.filter(f => g.ids.includes(f.id) && (data.settings.frameworks.includes(f.id) || f.id === frameworkId));
              return list.length ? (
                <optgroup key={g.label} label={g.label}>
                  {list.map(f => <option key={f.id} value={f.id}>{f.name}{f.coverage === 'preview' ? ' (preview)' : ''}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
        </div>

        <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-4 pb-4">
          {nav.filter(n => !n.hidden).map(n => (
            <div key={n.id}>
            {n.section && <p className="px-3 pb-1 pt-4 text-[10px] font-bold uppercase tracking-wider text-slate-600">{n.section}</p>}
            <button onClick={() => navigate(n.id)}
              className={cx('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                tab === n.id ? 'bg-sky-500/10 font-semibold text-sky-400' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200')}>
              <n.icon size={17} />
              <span className="flex-1 text-left">{n.label}</span>
              {!!n.badge && <span className="rounded-full bg-red-500/15 px-2 text-xs font-semibold text-red-400">{n.badge}</span>}
            </button>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <p className="truncate text-sm font-medium text-slate-200">{data.user.name}</p>
          <p className="truncate text-xs text-slate-500">{data.user.email} · {data.user.role}</p>
          <button onClick={signOut} className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"><LogOut size={14} /> Sign out</button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile navigation */}
        <div className="flex gap-1 overflow-x-auto border-b border-slate-800 bg-slate-900 p-2 md:hidden">
          {nav.filter(n => !n.hidden).map(n => (
            <button key={n.id} onClick={() => navigate(n.id)}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs', tab === n.id ? 'bg-sky-500/10 text-sky-400' : 'text-slate-400')}>
              <n.icon size={14} /> {n.label}
            </button>
          ))}
        </div>

        {data.features.hasSampleData && (
          <div className="flex flex-wrap items-center gap-3 border-b border-amber-500/20 bg-amber-500/10 px-6 py-2.5 text-sm text-amber-200">
            <FlaskConical size={16} />
            <span className="flex-1">You are viewing <strong>sample data</strong> for a fictional company. It is replaced automatically after your first real scan.</span>
            {canEdit && (
              <Button size="sm" variant="secondary" onClick={async () => { await api('/api/sample-data', { method: 'DELETE' }); refresh(); }}>
                Clear sample data
              </Button>
            )}
          </div>
        )}

        <main className="mx-auto w-full max-w-7xl flex-1 space-y-8 p-6 md:p-8">
          {tab === 'dashboard' && <DashboardTab {...props} />}
          {tab === 'controls' && <ControlsTab {...props} />}
          {tab === 'findings' && <FindingsTab {...props} />}
          {tab === 'policies' && <PoliciesTab {...props} />}
          {tab === 'people' && <PeopleTab {...props} />}
          {tab === 'devices' && <DevicesTab {...props} />}
          {tab === 'evidence' && <EvidenceTab {...props} />}
          {tab === 'questionnaires' && <QuestionnairesTab {...props} />}
          {tab === 'trust' && <TrustTab {...props} />}
          {tab === 'connectors' && <ConnectorsTab {...props} />}
          {tab === 'assistant' && data.features.assistant && <AssistantTab />}
          {tab === 'settings' && <SettingsTab {...props} />}
        </main>
      </div>

      {upload && (
        <UploadEvidenceModal data={data} frameworkId={frameworkId} preselected={upload}
          onClose={() => setUpload(null)} onDone={() => { setUpload(null); refresh(); }} />
      )}
    </div>
  );
}
