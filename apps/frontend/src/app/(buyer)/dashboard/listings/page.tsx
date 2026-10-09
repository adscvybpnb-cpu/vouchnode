'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ClipboardList, Clock3, EyeOff, Plus, ShoppingBag } from 'lucide-react';

type ListingTab = 'Draft' | 'On Sale' | 'Sold' | 'Expired';

const tabs: Array<{ label: ListingTab; icon: typeof ClipboardList }> = [
  { label: 'Draft', icon: ClipboardList },
  { label: 'On Sale', icon: ShoppingBag },
  { label: 'Sold', icon: Clock3 },
  { label: 'Expired', icon: EyeOff },
];

export default function ListingsPage() {
  const [activeTab, setActiveTab] = useState<ListingTab>('On Sale');

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-[#12131a] p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller workspace</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Listings</h1>
          <p className="mt-2 text-sm text-slate-400">Manage your digital products and gift card inventory.</p>
        </div>
        <Link
          href="/seller/create-listing"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400"
        >
          <Plus className="h-4 w-4" />
          <span>Create New Listing</span>
          <span className="text-indigo-200">/ إنشاء منتج</span>
        </Link>
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[#10141c]">
        <div className="flex gap-1 overflow-x-auto border-b border-white/10 p-2">
          {tabs.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setActiveTab(label)}
              className={`inline-flex min-w-max items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition ${
                activeTab === label
                  ? 'bg-indigo-500/15 text-indigo-200'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/[0.06] text-slate-500">
            <ClipboardList className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">No {activeTab.toLowerCase()} listings yet</h2>
          <p className="mt-2 max-w-md text-sm text-slate-400">
            Create an auto-delivery product listing to start selling securely on VouchNode.
          </p>
          <Link href="/seller/create-listing" className="mt-5 text-sm font-semibold text-indigo-300 hover:text-indigo-200">
            Create your first listing
          </Link>
        </div>
      </div>
    </section>
  );
}
