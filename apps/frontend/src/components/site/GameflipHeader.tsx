'use client';

import Link from 'next/link';
import { Menu, Sparkles, Wallet2 } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';

export function GameflipHeader() {
  const { isAuthenticated, user } = useAuthStore();

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#05070b]/85 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Open menu"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 md:hidden"
          >
            <Menu size={18} />
          </button>

          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 via-cyan-400 to-violet-500 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/30">
              GF
            </div>
            <div className="text-lg font-black tracking-[0.22em] text-white">VOUCHNODE</div>
          </Link>
        </div>

        <nav className="hidden items-center gap-6 text-sm text-slate-300 md:flex">
          <Link href="/products" className="transition hover:text-white">Marketplace</Link>
          <Link href="/products?category=gift-cards" className="transition hover:text-white">Deals</Link>
          <Link href="/chat" className="transition hover:text-white">Messages</Link>
        </nav>

        <div className="flex items-center gap-2 sm:gap-3">
          {isAuthenticated ? (
            <>
              <Link
                href="/dashboard/wallet"
                className="hidden items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-200 sm:inline-flex"
              >
                <Wallet2 size={16} className="text-emerald-400" />
                <span>{(user?.walletBalance?.available ?? 0).toFixed(2)}</span>
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-emerald-400/40 hover:bg-emerald-500/10"
              >
                Dashboard
              </Link>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:border-cyan-400/40 hover:bg-cyan-500/10"
              >
                Sign In
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl bg-[#f3f6ff] px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-white"
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
