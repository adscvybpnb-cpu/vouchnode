'use client';

import { useEffect, useState } from 'react';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-[#050507]" aria-hidden="true" />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050507] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <a href="/" translate="no" className="notranslate inline-flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600">
              <span translate="no" className="notranslate text-lg font-bold text-white">G</span>
            </div>
            <span translate="no" className="notranslate text-2xl font-bold text-white">VouchNode</span>
          </a>
        </div>
        {children}
      </div>
    </div>
  );
}
