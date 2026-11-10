'use client';

import { Bot, Send, User } from 'lucide-react';
import { useRef, useState } from 'react';
import { api, cx, PageHeader } from './ui';

type Message = { role: 'user' | 'assistant'; content: string };

const SUGGESTIONS = [
  'What should we fix first before our SOC 2 audit?',
  'Draft a short remediation plan for our open high-severity findings.',
  'Which controls still need uploaded evidence?',
];

export default function AssistantTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const next: Message[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const { reply } = await api<{ reply: string }>('/api/assistant/chat', { method: 'POST', json: { messages: next.slice(-20) } });
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages([...next, { role: 'assistant', content: (err as Error).message }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-6">
      <PageHeader title="Assistant" subtitle="Ask about your controls, findings and evidence. It can only read and explain; it never changes anything, and pass/fail always comes from the checks." />
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40">
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {messages.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Bot className="text-slate-600" size={36} />
              <p className="text-sm text-slate-400">Try one of these:</p>
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:border-sky-500/50 hover:text-sky-300">{s}</button>
              ))}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cx('flex gap-3', m.role === 'user' && 'flex-row-reverse')}>
              <div className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', m.role === 'user' ? 'bg-slate-700' : 'bg-sky-600')}>
                {m.role === 'user' ? <User size={15} /> : <Bot size={15} />}
              </div>
              <div className={cx('max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed',
                m.role === 'user' ? 'bg-sky-600 text-white' : 'border border-slate-700 bg-slate-800/80 text-slate-200')}>
                {m.content}
              </div>
            </div>
          ))}
          {busy && <p className="text-sm text-slate-500">Thinking…</p>}
          <div ref={endRef} />
        </div>
        <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-slate-800 bg-slate-900/80 p-4">
          <input value={input} onChange={e => setInput(e.target.value)} disabled={busy} maxLength={4000}
            placeholder="Ask a question…" className="flex-1 rounded-full border border-slate-700 bg-slate-950 px-4 py-2.5 text-sm outline-none focus:border-sky-500" />
          <button type="submit" disabled={busy || !input.trim()} className="rounded-full bg-sky-600 p-2.5 text-white hover:bg-sky-500 disabled:opacity-50" aria-label="Send"><Send size={16} /></button>
        </form>
      </div>
    </div>
  );
}
