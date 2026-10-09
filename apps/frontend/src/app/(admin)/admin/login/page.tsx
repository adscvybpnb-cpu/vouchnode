'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/store/auth.store';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';

const ADMIN_LOGIN_ENDPOINT = '/auth/admin-login';

export default function AdminLoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [resetTurnstile, setResetTurnstile] = useState<() => void>(() => () => {});
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !turnstileToken) return;

    setBusy(true);
    setError('');
    try {
      const response = await apiClient.post<{ accessToken: string; user: { id: string; username: string; email: string; role: 'ADMIN'; isVerified: boolean } }>(
        ADMIN_LOGIN_ENDPOINT,
        { username: username.trim(), password, turnstileToken },
      );
      if (response.error || !response.data) {
        setError(response.error || 'Unable to sign in.');
        resetTurnstile();
        return;
      }
      setAuth(response.data.user, response.data.accessToken);
      router.replace('/admin');
    } catch {
      setError('Unable to sign in. Please try again.');
      resetTurnstile();
    } finally {
      setBusy(false);
    }
  };
  return <main className="flex min-h-screen items-center justify-center bg-[#080a10] px-4"><form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-cyan-400/20 bg-white/[0.03] p-8 shadow-2xl"><p className="text-xs uppercase tracking-[0.2em] text-cyan-300">Restricted control plane</p><h1 className="mt-2 text-2xl font-semibold text-white">Admin sign in</h1><p className="mt-2 text-sm text-slate-400">Use the dedicated administrator credentials configured on the server.</p>{error && <p role="alert" className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}<label className="mt-6 block text-sm text-slate-300">Admin Username<input required value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none focus:border-cyan-400" /></label><label className="mt-4 block text-sm text-slate-300">Admin Password<input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 text-white outline-none focus:border-cyan-400" /></label><div className="mt-5"><TurnstileWidget onToken={setTurnstileToken} onResetReady={(reset) => setResetTurnstile(() => reset)} /></div><Button type="submit" isLoading={busy} disabled={busy || !turnstileToken} className="mt-6 w-full">Sign in securely</Button></form></main>;
}
