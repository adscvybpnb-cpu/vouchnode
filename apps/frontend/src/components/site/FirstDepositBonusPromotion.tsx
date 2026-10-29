'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Gift, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { apiClient } from '@/services/api.client';
import { hasUsableAccessToken, useAuthStore } from '@/store/auth.store';

export function FirstDepositBonusPromotion() {
  const { accessToken, hasHydrated, isAuthenticated, user } = useAuthStore();
  const hasSession = isAuthenticated && hasUsableAccessToken(accessToken);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!hasHydrated) return;

    if (!hasSession) {
      setIsOpen(true);
      return;
    }

    let active = true;
    void apiClient.get<{ eligible: boolean }>('/wallet/first-deposit-bonus/eligibility')
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          console.error('Unable to check first-deposit promotion eligibility:', error);
          setIsOpen(false);
          return;
        }
        setIsOpen(data.eligible === true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        console.error('Unable to check first-deposit promotion eligibility:', error);
        setIsOpen(false);
      });

    return () => {
      active = false;
    };
  }, [hasHydrated, hasSession, user?.id]);

  const dismiss = () => {
    setIsOpen(false);
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) dismiss();
        else setIsOpen(true);
      }}
    >
      <DialogContent className="w-[calc(100%-2rem)] max-w-md overflow-hidden rounded-3xl border border-indigo-300/20 bg-[#10111b] p-0 text-white shadow-2xl shadow-indigo-950/60 sm:rounded-3xl">
        <div className="relative overflow-hidden px-6 pb-6 pt-8 sm:px-8 sm:pb-8">
          <div className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-14 h-48 w-48 rounded-full bg-cyan-500/10 blur-3xl" />
          <div className="relative">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-300/20 bg-indigo-500/15 text-indigo-200">
                <Gift className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="flex items-center gap-2.5 pr-8" aria-label="BNB, Solana, and Tether supported">
                {[
                  { name: 'BNB', src: '/icons/crypto/bnb.svg', glow: 'shadow-yellow-400/30' },
                  { name: 'Solana', src: '/icons/crypto/sol.svg', glow: 'shadow-violet-400/30' },
                  { name: 'Tether', src: '/icons/crypto/usdt.svg', glow: 'shadow-emerald-400/30' },
                ].map((asset) => (
                  <div
                    key={asset.name}
                    className={`flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] shadow-lg ${asset.glow}`}
                    title={asset.name}
                  >
                    <Image src={asset.src} alt={asset.name} width={28} height={28} unoptimized />
                  </div>
                ))}
              </div>
            </div>
            <DialogTitle className="max-w-sm text-left text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              Get $10 Free on Your First Deposit!
            </DialogTitle>
            <DialogDescription className="mt-3 text-left text-sm leading-6 text-slate-300 sm:text-base">
              Register, fund your wallet, and get a $10 USDT bonus added instantly to your balance.
            </DialogDescription>
            <div className="mt-5 flex items-center gap-2 text-xs font-medium text-indigo-200">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>For first wallet deposits of $50 USD or more</span>
            </div>
            <Link
              href={hasSession ? '/dashboard/wallet/deposit' : '/register'}
              onClick={dismiss}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-950/40 transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#10111b]"
            >
              {hasSession ? 'Deposit now' : 'Register and get $10'}
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </Link>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              One bonus per account. Your qualifying deposit must be worth at least $50 USD.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
