'use client';

import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

export default function SecurityPage() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 text-white sm:px-6">
      <Link href="/dashboard/profile" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Back to profile
      </Link>
      <section className="rounded-2xl border border-white/10 bg-[#141620] p-6 shadow-xl sm:p-8">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-emerald-300" />
          <div>
            <p className="text-sm font-medium text-emerald-300">Account security</p>
            <h1 className="text-2xl font-bold">Protect your account</h1>
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Update your password and profile security settings from the authenticated profile security panel.
        </p>
        <Link href="/dashboard/profile?tab=security" className="mt-6 inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold hover:bg-indigo-400">
          Open security settings
        </Link>
      </section>
    </main>
  );
}
