'use client';

import { useState, type FormEvent } from 'react';
import { LogoMark } from './Logo';
import { api, Button, ErrorText, Field, inputCls } from './ui';

export default function AuthForm({ mode }: { mode: 'login' | 'setup' }) {
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const setup = mode === 'setup';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api(setup ? '/api/auth/setup' : '/api/auth/login', { method: 'POST', json: form });
      window.location.href = '/';
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_#0f172a,_#020617_60%)] p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-5 rounded-2xl border border-slate-800 bg-slate-900/80 p-8 shadow-2xl">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-sky-400 to-sky-600 text-slate-950 shadow-lg shadow-sky-500/20"><LogoMark size={34} /></div>
          <h1 className="text-xl font-bold text-slate-50">{setup ? 'Set up ControlLayer' : 'Sign in to ControlLayer'}</h1>
          <p className="text-sm text-slate-400">
            {setup ? 'Create the first administrator account for your workspace.' : 'Continuous compliance and audit evidence.'}
          </p>
        </div>
        {setup && (
          <Field label="Your name">
            <input className={inputCls} required autoComplete="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </Field>
        )}
        <Field label="Work email">
          <input className={inputCls} type="email" required autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="Password" hint={setup ? 'At least 12 characters.' : undefined}>
          <input className={inputCls} type="password" required minLength={setup ? 12 : undefined} autoComplete={setup ? 'new-password' : 'current-password'}
            value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy} className="w-full">{busy ? 'Please wait…' : setup ? 'Create workspace' : 'Sign in'}</Button>
        {!setup && <p className="text-center text-xs text-slate-500">Forgot your password? Ask an administrator to reset it.</p>}
      </form>
    </main>
  );
}
