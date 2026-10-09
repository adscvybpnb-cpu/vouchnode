'use client';

import { useEffect } from 'react';

export default function AdminErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#080a10] px-4 text-center text-white">
      <h2 className="text-2xl font-bold text-red-300">Admin page error</h2>
      <p className="mt-3 max-w-md text-sm text-slate-400">The requested admin view could not be rendered.</p>
      <button type="button" onClick={reset} className="mt-6 rounded-md bg-cyan-500 px-5 py-2 font-semibold text-slate-950 hover:bg-cyan-400">Try again</button>
    </div>
  );
}
