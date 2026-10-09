'use client';

import { CheckCircle2, Lock, ShieldCheck, TrendingUp } from 'lucide-react';

const badges = [
  { label: 'Escrow protected', detail: 'Funds stay locked until delivery is confirmed.', icon: Lock },
  { label: 'Verified merchants', detail: 'KYC-checked sellers with strong review profiles.', icon: ShieldCheck },
  { label: 'Fast settlements', detail: 'Average payout and release time under 2 minutes.', icon: TrendingUp },
  { label: 'Buyer satisfaction', detail: '99.3% success rate across active marketplace orders.', icon: CheckCircle2 },
];

export function TrustBadges() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {badges.map((badge) => {
          const Icon = badge.icon;
          return (
            <div
              key={badge.label}
              className="rounded-[24px] border border-white/10 bg-[#0a1017] p-5 shadow-[0_20px_40px_rgba(0,0,0,0.18)]"
            >
              <div className="mb-4 inline-flex rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-300">
                <Icon size={18} />
              </div>
              <h3 className="text-base font-bold text-white">{badge.label}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{badge.detail}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
