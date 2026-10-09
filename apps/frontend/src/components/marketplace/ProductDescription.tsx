'use client';

import { useState } from 'react';

export function ProductDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 280;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className={`break-all whitespace-pre-wrap overflow-hidden text-sm leading-7 text-slate-300 ${!expanded && isLong ? 'line-clamp-5' : ''}`}>
        {text}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="mt-3 text-sm font-semibold text-indigo-300 transition hover:text-indigo-200"
        >
          {expanded ? 'Show Less' : 'Load More...'}
        </button>
      )}
    </div>
  );
}
