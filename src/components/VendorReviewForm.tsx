'use client';

import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import type { VendorAnswer } from '@/vendors/risk';
import { api, Button, cx, ErrorText, Field, inputCls } from './ui';

const CHOICES: { id: VendorAnswer['answer']; label: string }[] = [
  { id: 'yes', label: 'Yes' }, { id: 'partial', label: 'Partially' }, { id: 'no', label: 'No' }, { id: 'na', label: 'N/A' },
];

export default function VendorReviewForm({ token, organization, vendor, sentTo, done: initiallyDone, questions }: {
  token: string; organization: string; vendor: string; sentTo: string; done: boolean;
  questions: { id: string; topic: string; question: string }[];
}) {
  const [answers, setAnswers] = useState<Record<string, VendorAnswer>>({});
  const [respondent, setRespondent] = useState(sentTo);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(initiallyDone);
  const answered = questions.filter(q => answers[q.id]?.answer).length;

  if (done) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center p-6 text-center">
        <CheckCircle2 className="text-emerald-400" size={40} />
        <h1 className="mt-3 text-xl font-semibold text-slate-100">Thank you</h1>
        <p className="mt-2 text-sm text-slate-400">Your answers were sent to {organization}. You can close this page.</p>
      </main>
    );
  }

  async function submit() {
    setBusy(true);
    setError('');
    const body = new FormData();
    body.set('answers', JSON.stringify(answers));
    body.set('respondent', respondent);
    if (file) body.set('file', file);
    try {
      await api(`/api/vendor-review/${encodeURIComponent(token)}`, { method: 'POST', body });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6 md:py-12">
      <header>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-400"><ShieldCheck size={14} /> {organization}</p>
        <h1 className="mt-2 text-2xl font-bold text-slate-50">Security questionnaire for {vendor}</h1>
        <p className="mt-1 text-sm text-slate-400">{organization} reviews the security of the vendors it works with. This takes about 10 minutes: {questions.length} questions, plus an optional security report (SOC 2 or ISO 27001).</p>
      </header>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const header = q.topic !== questions[i - 1]?.topic ? q.topic : null;
          const a = answers[q.id];
          return (
            <div key={q.id}>
              {header && <p className="pb-2 pt-4 text-xs font-semibold uppercase tracking-wider text-slate-500">{header}</p>}
              <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4">
                <p className="text-sm text-slate-100"><span className="mr-2 font-mono text-xs text-slate-500">{i + 1}</span>{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {CHOICES.map(c => (
                    <button key={c.id} type="button" onClick={() => setAnswers({ ...answers, [q.id]: { ...a, answer: c.id } })}
                      className={cx('rounded-lg border px-3 py-1.5 text-sm', a?.answer === c.id ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-slate-700 text-slate-400 hover:border-slate-500')}>
                      {c.label}
                    </button>
                  ))}
                </div>
                {a?.answer && a.answer !== 'yes' && (
                  <input className={inputCls} placeholder="Add a short explanation (optional)" value={a.comment ?? ''}
                    onChange={e => setAnswers({ ...answers, [q.id]: { ...a, comment: e.target.value } })} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="space-y-4 rounded-xl border border-sky-500/30 bg-sky-500/5 p-5">
        <Field label="Security report (optional)" hint="SOC 2 Type II report, ISO 27001 certificate or penetration test summary. Shared only with the company that sent this link.">
          <input type="file" onChange={e => setFile(e.target.files?.[0] ?? null)} className="block w-full text-sm text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:text-slate-200" />
        </Field>
        <Field label="Your name and email"><input className={inputCls} value={respondent} onChange={e => setRespondent(e.target.value)} /></Field>
        <ErrorText>{error}</ErrorText>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">{answered} of {questions.length} answered</span>
          <Button disabled={busy || answered < questions.length || respondent.trim().length < 3} onClick={submit}>{busy ? 'Sending…' : 'Submit answers'}</Button>
        </div>
      </div>
    </main>
  );
}
