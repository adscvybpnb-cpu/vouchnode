'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { TurnstileWidget } from '@/components/auth/TurnstileWidget';

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const router = useRouter();
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [resetTurnstile, setResetTurnstile] = useState<() => void>(() => () => {});

  useEffect(() => {
    const message = window.sessionStorage.getItem('account-restriction-message');
    if (!message) return;
    window.sessionStorage.removeItem('account-restriction-message');
    setAccountNotice(message);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email.trim() || !password) {
      setFormError('Please enter your email and password.');
      return;
    }

    try {
      await login({ email: email.trim().toLowerCase(), password, turnstileToken });
      setIsRedirecting(true);
      router.push('/');
    } catch (err: any) {
      setIsRedirecting(false);
      let msg: string;
      try {
        msg =
          (typeof err?.message === 'string' && err.message.length > 0 && err.message !== '[object Object]')
            ? err.message
            : 'Login failed. Please check your credentials and try again.';
      } catch {
        msg = 'An unexpected error occurred. Please try again.';
      }
      setFormError(msg);
      resetTurnstile();
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-[#141420] p-8 rounded-2xl border border-[#1E1E2E] shadow-xl">

        {/* Header */}
        <div className="text-center">
          <h2 className="text-3xl font-extrabold text-white">Sign In</h2>
          <p className="mt-2 text-sm text-gray-400">Welcome back to VouchNode</p>
        </div>

        {accountNotice && (
          <div role="alert" className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3.5 text-sm text-amber-200">
            {accountNotice}
          </div>
        )}

        {/* Error banner */}
        {formError && (
          <div
            role="alert"
            className="flex items-start gap-3 p-3.5 bg-red-500/10 border border-red-500/40 text-red-400 rounded-lg text-sm"
          >
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
            </svg>
            <span>{formError}</span>
          </div>
        )}

        <form className="mt-6 space-y-5" onSubmit={handleSubmit} noValidate>
          {/* Email */}
          <div>
            <label htmlFor="login-email" className="text-sm font-medium text-gray-300 block mb-1.5">
              Email address
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setFormError(null); }}
              disabled={isLoading || isRedirecting}
              className="w-full h-11 bg-[#0A0A0F] border border-[#1E1E2E] rounded-lg px-3 py-2 text-white text-sm
                placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40
                focus:border-indigo-500/60 transition-all disabled:opacity-50"
              placeholder="you@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="login-password" className="text-sm font-medium text-gray-300">
                Password
              </label>
              <Link href="/forgot-password" className="text-xs text-indigo-400 hover:text-indigo-300 hover:underline transition-colors">
                Forgot password?
              </Link>
            </div>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => { setPassword(e.target.value); setFormError(null); }}
              disabled={isLoading || isRedirecting}
              className="w-full h-11 bg-[#0A0A0F] border border-[#1E1E2E] rounded-lg px-3 py-2 text-white text-sm
                placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40
                focus:border-indigo-500/60 transition-all disabled:opacity-50"
              placeholder="••••••••"
            />
          </div>

          <TurnstileWidget
            onToken={setTurnstileToken}
            onResetReady={(reset) => setResetTurnstile(() => reset)}
          />

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading || isRedirecting || !turnstileToken}
            className="w-full flex items-center justify-center gap-2 h-11 px-4 rounded-lg text-sm font-semibold
              bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20
              focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-[#141420]
              disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
          >
            {isLoading || isRedirecting ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Signing in…
              </>
            ) : 'Sign In'}
          </button>
        </form>

        {/* Footer */}
        <p className="text-center text-sm text-gray-500 pt-2">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-indigo-400 font-medium hover:text-indigo-300 hover:underline transition-colors">
            Sign Up
          </Link>
        </p>
      </div>
    </div>
  );
}
