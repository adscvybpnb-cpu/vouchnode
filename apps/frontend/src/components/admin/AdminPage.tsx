'use client';

import type { ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function AdminPage({ title, description, loading, error, onRetry, children, actions }: { title: string; description: string; loading?: boolean; error?: string; onRetry?: () => void; children: ReactNode; actions?: ReactNode }) {
  return <main className="flex h-full min-h-0 w-full flex-col px-4 py-6 text-white sm:px-6 lg:px-8">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-300">Admin control panel</p><h1 className="mt-2 text-3xl font-bold">{title}</h1><p className="mt-2 text-sm text-slate-400">{description}</p></div>{actions}</div>
    {loading && <div className="space-y-3" aria-label="Loading"><Skeleton className="h-12 w-full bg-white/10" /><Skeleton className="h-48 w-full bg-white/10" /></div>}
    {!loading && error && <div role="alert" className="flex items-center justify-between gap-4 rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-200"><span>{error}</span>{onRetry && <Button size="sm" variant="outline" onClick={onRetry}><RefreshCw className="mr-2 h-4 w-4" />Retry</Button>}</div>}
    {!loading && !error && <div className="min-h-0 flex-1">{children}</div>}
  </main>;
}

export function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-6 py-14 text-center text-sm text-slate-400">{message}</div>;
}

export function AdminBadge({ value }: { value: string | boolean | null | undefined }) {
  const label = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value ?? 'Unknown').replaceAll('_', ' ');
  return <span className="inline-flex rounded-full bg-cyan-400/10 px-2.5 py-1 text-xs capitalize text-cyan-200">{label}</span>;
}
