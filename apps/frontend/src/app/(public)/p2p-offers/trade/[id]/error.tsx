'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function P2PTradeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Quick P2P trade page failed:', error);
  }, [error]);

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center bg-[#07090f] px-4 text-center text-white">
      <h1 className="text-2xl font-bold">Unable to load this trade</h1>
      <p className="mt-3 max-w-md text-sm text-slate-400">
        Your wallet is only debited when the server confirms and locks the order. You can safely retry this page.
      </p>
      <div className="mt-6 flex gap-3">
        <button type="button" onClick={reset} className="rounded-lg bg-blue-500 px-4 py-2 font-semibold hover:bg-blue-400">
          Try again
        </button>
        <Link href="/p2p-offers" className="rounded-lg border border-white/15 px-4 py-2 font-semibold text-slate-300 hover:bg-white/5">
          Back to offers
        </Link>
      </div>
    </main>
  );
}
