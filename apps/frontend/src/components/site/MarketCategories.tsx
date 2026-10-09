'use client';

import Link from 'next/link';
import { ArrowRight, ShieldCheck, ShoppingBag, Sparkles, WalletCards } from 'lucide-react';

const categories = [
  {
    name: 'Gift Cards',
    description: 'Steam, Amazon, PlayStation, and digital store credit.',
    icon: WalletCards,
    href: '/products',
    accent: 'from-emerald-500/20 to-emerald-500/5',
  },
  {
    name: 'Game Credits',
    description: 'Top-ups, bundles, and in-game balances for every platform.',
    icon: ShoppingBag,
    href: '/products',
    accent: 'from-violet-500/20 to-violet-500/5',
  },
  {
    name: 'Verified Sellers',
    description: 'Trade with highly rated merchants and protected escrow flows.',
    icon: ShieldCheck,
    href: '/sellers',
    accent: 'from-cyan-500/20 to-cyan-500/5',
  },
  {
    name: 'Premium Deals',
    description: 'Limit-time savings and top-value bundles for buyers.',
    icon: Sparkles,
    href: '/products',
    accent: 'from-amber-500/20 to-amber-500/5',
  },
];

export function MarketCategories() {
  return (
    <section className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.26em] text-slate-500">Browse by category</div>
          <h2 className="mt-2 text-2xl font-black text-white">Popular marketplace categories</h2>
        </div>
        <Link href="/products" className="inline-flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-white">
          See all categories
          <ArrowRight size={16} />
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {categories.map((category) => {
          const Icon = category.icon;
          return (
            <Link
              key={category.name}
              href={category.href}
              className="group rounded-[26px] border border-white/10 bg-[#0a1017] p-5 transition hover:-translate-y-1 hover:border-emerald-500/35"
            >
              <div className={`mb-4 inline-flex rounded-2xl bg-gradient-to-br ${category.accent} p-3`}>
                <Icon size={22} className="text-white" />
              </div>
              <h3 className="text-lg font-bold text-white">{category.name}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">{category.description}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
