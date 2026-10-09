'use client';

import { useEffect, useRef, useState } from 'react';
import { Eye, Loader2, MessageSquare, X } from 'lucide-react';
import { messageService } from '@/services/message.service';
import { useAdminSocket } from '@/hooks/useAdminSocket';
import type { Message } from '@/types/api.types';

function renderAttachment(message: Message) {
  if (!message.fileUrl) return null;
  const type = String(message.messageType || '').toUpperCase();
  const url = message.fileUrl.toLowerCase();
  const isVideo = type === 'VIDEO' || /\.(mp4|webm|mov)(?:$|[?#])/i.test(url);
  const isImage = type === 'IMAGE' || /\.(png|jpe?g|gif|webp)(?:$|[?#])/i.test(url);
  if (isVideo) return <video controls className="mt-2 max-h-56 w-full rounded-lg" src={message.fileUrl}>Video evidence</video>;
  if (isImage) return <img className="mt-2 max-h-56 w-full rounded-lg object-contain" src={message.fileUrl} alt="Submitted evidence" />;
  return <a href={message.fileUrl} target="_blank" rel="noreferrer" className="mt-2 block text-sm text-cyan-300 hover:text-cyan-200">View submitted evidence</a>;
}

export function AdminChatViewer({ conversationId, title, onClose, buyerId, sellerId }: { conversationId: string; title: string; onClose: () => void; buyerId?: string; sellerId?: string }) {
  const { socket, isConnected } = useAdminSocket('/chat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    void messageService.getMessages(conversationId)
      .then((items) => { if (active) setMessages(items); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load chat history.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId]);

  useEffect(() => {
    if (!socket || !isConnected) return;
    const onMessage = (message: Message) => {
      if (message.conversationId === conversationId) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
    };
    socket.emit('join_conversation', conversationId);
    socket.emit('join_admin_chat');
    socket.on('new_message', onMessage);
    return () => {
      socket.emit('leave_conversation', conversationId);
      socket.off('new_message', onMessage);
    };
  }, [conversationId, isConnected, socket]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <section className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#0d111b] shadow-2xl lg:inset-y-10 lg:left-auto lg:right-10 lg:w-[min(560px,calc(100vw-2rem))]">
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2"><Eye className="h-4 w-4 text-cyan-300" /><div><p className="text-xs uppercase tracking-wider text-cyan-300">Admin audit view</p><h2 className="font-semibold text-white">{title}</h2></div></div>
        <button type="button" onClick={onClose} aria-label="Close chat viewer" className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-5 w-5" /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {loading && <div className="flex justify-center py-10 text-slate-400"><Loader2 className="h-5 w-5 animate-spin" /></div>}
        {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-3 text-sm text-red-200">{error}</p>}
        {!loading && !error && messages.length === 0 && <div className="py-10 text-center text-sm text-slate-500"><MessageSquare className="mx-auto mb-2 h-6 w-6" />No messages in this conversation.</div>}
        {(['buyer', 'seller'] as const).map((side) => {
          const participantId = side === 'buyer' ? buyerId : sellerId;
          const sideMessages = participantId ? messages.filter((message) => message.senderId === participantId) : messages;
          return <section key={side} className="space-y-3 rounded-xl border border-white/10 p-3">
            <h3 className="text-sm font-semibold text-cyan-200">{side === 'buyer' ? "Buyer's Evidence" : "Seller's Evidence"}</h3>
            {sideMessages.length === 0 && <p className="text-sm text-slate-500">No evidence or messages submitted.</p>}
            {sideMessages.map((message) => <article key={message.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="flex items-center justify-between gap-3 text-xs text-slate-500"><span>{message.sender?.profile?.displayName || message.sender?.profile?.username || message.senderId}</span><time>{new Date(message.createdAt).toLocaleString()}</time></div>{message.visibility === 'ADMIN_ONLY' && <span className="mt-2 inline-flex rounded-full border border-amber-300/40 bg-amber-300/10 px-2 py-1 text-[10px] font-semibold tracking-wide text-amber-200">[PRIVATE EVIDENCE - ADMIN ONLY]</span>}{renderAttachment(message)}{(message.content || message.text) && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{message.content || message.text}</p>}</article>)}
          </section>;
        })}
        <div ref={bottomRef} />
      </div>
      <footer className="border-t border-white/10 px-5 py-3 text-xs text-slate-500">{isConnected ? 'Live updates connected' : 'Connecting to live updates...'}</footer>
    </section>
  );
}
