'use client';

import { ConversationList } from '@/components/chat/ConversationList';

export default function SellerMessagesPage() {
  return <section className="mx-auto max-w-6xl space-y-6 p-6"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">Seller Studio</p><h1 className="mt-2 text-3xl font-bold text-white">Messages</h1><p className="mt-1 text-sm text-slate-400">Reply to buyers and keep order conversations in one place.</p></div><ConversationList /></section>;
}
