'use client';

import { useEffect, useRef, useState } from 'react';

type OfferTermsProps = {
  terms: string;
  className?: string;
};

export function OfferTerms({ terms, className = '' }: OfferTermsProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);

  useEffect(() => {
    setExpanded(false);
    const content = contentRef.current;
    if (!content) return;

    const measure = () => setHasOverflow(content.scrollHeight > content.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    return () => observer.disconnect();
  }, [terms]);

  return (
    <div className={`w-full max-w-full min-w-0 ${className}`}>
      <div
        ref={contentRef}
        className={`w-full max-w-full min-w-0 break-words whitespace-pre-wrap [overflow-wrap:anywhere] text-sm leading-6 text-slate-300 transition-[max-height] duration-300 ${
          expanded
            ? 'max-h-52 overflow-y-auto overscroll-contain'
            : 'line-clamp-4 max-h-[7.5rem] overflow-hidden'
        }`}
      >
        {terms}
      </div>
      {hasOverflow && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-sm font-semibold text-emerald-300 transition hover:text-emerald-200"
          aria-expanded={expanded}
        >
          {expanded ? 'Show Less' : 'Show More'}
        </button>
      )}
    </div>
  );
}
