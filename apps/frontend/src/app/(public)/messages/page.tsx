'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { MessageCircle, Send, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthStore } from '@/store/auth.store';
import { apiClient } from '@/services/api.client';
import type { Message } from '@/types/api.types';
import { API_ORIGIN, WS_URL } from '@/lib/constants';

interface Conversation {
  id: string;
  buyerId: string;
  sellerId: string;
  order?: { orderNumber: string } | null;
  lastMessageAt?: string | null;
  buyer?: Participant;
  seller?: Participant;
  participant?: Participant;
}
interface Participant {
  id: string;
  profile?: { username?: string | null; displayName?: string | null; avatarUrl?: string | null } | null;
}
type ChatMessage = Message & { sender?: Participant };

const socketUrl = () => {
  return (WS_URL || API_ORIGIN)
    .replace(/^ws:/i, 'http:')
    .replace(/^wss:/i, 'https:')
    .replace(/\/+(chat|notifications|socket\.io)\/?$/i, '')
    .replace(/\/+$/, '');
};

export default function MessagesPage() {
  const userId = useAuthStore((state) => state.user?.id);
  const accessToken = useAuthStore((state) => state.accessToken);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const socketRef = useRef<Socket | null>(null);
  const socketCleanupRef = useRef<number | null>(null);
  const selectedIdRef = useRef(selectedId);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  const loadConversations = async () => {
    const response = await apiClient.get<Conversation[]>('/messages/conversations');
    if (response.error) throw new Error(response.error);
    const next = response.data || [];
    setConversations(next);
    setSelectedId((current) => current || next[0]?.id || '');
  };

  const loadMessages = async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const response = await apiClient.get<ChatMessage[]>(`/messages/conversations/${conversationId}/messages`);
      if (response.error) throw new Error(response.error);
      setMessages(response.data || []);
      await apiClient.patch(`/messages/conversations/${conversationId}/read`, {});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load messages.');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    void loadConversations().catch((err) => setError(err instanceof Error ? err.message : 'Unable to load conversations.')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (socketCleanupRef.current !== null) {
      window.clearTimeout(socketCleanupRef.current);
      socketCleanupRef.current = null;
    }

    const socketToken = useAuthStore.getState().accessToken;
    if (!socketToken) return;
    const socket = io(`${socketUrl()}/chat`, {
      auth: { token: socketToken },
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      upgrade: true,
      withCredentials: true,
      reconnectionAttempts: 3,
      timeout: 5000,
    });
    socketRef.current = socket;
    const handleMessage = (message: ChatMessage) => {
      if (message.conversationId === selectedIdRef.current) {
        setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message]);
      }
      setConversations((current) => current.map((conversation) =>
        conversation.id === message.conversationId
          ? { ...conversation, lastMessageAt: message.createdAt }
          : conversation
      ));
    };
    const joinSelectedConversation = () => {
      if (selectedIdRef.current) socket.emit('join_conversation', selectedIdRef.current);
    };
    socket.on('new_message', handleMessage);
    socket.on('connect', joinSelectedConversation);
    socket.on('error', (message: string) => setError(message || 'Chat request failed.'));
    socket.on('connect_error', () => setError('Real-time chat is unavailable. Please retry the connection.'));
    return () => {
      socketCleanupRef.current = window.setTimeout(() => {
        if (socketRef.current !== socket) return;
        socket.disconnect();
        socketRef.current = null;
      }, 0);
      socket.off('new_message', handleMessage);
      socket.off('connect', joinSelectedConversation);
      socket.off('error');
    };
  }, [accessToken]);

  useEffect(() => {
    if (!selectedId) return;
    window.dispatchEvent(new CustomEvent('chat:active', { detail: { conversationId: selectedId } }));
    return () => {
      window.dispatchEvent(new CustomEvent('chat:inactive', { detail: { conversationId: selectedId } }));
    };
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) {
      void loadMessages(selectedId);
      if (socketRef.current?.connected) socketRef.current.emit('join_conversation', selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !selectedId || sending) return;
    setSending(true);
    setError('');
    try {
      if (socketRef.current?.connected) {
        await new Promise<void>((resolve, reject) => {
          socketRef.current?.emit(
            'send_message',
            { conversationId: selectedId, content },
            (result: { ok: boolean; error?: string }) => {
              if (!result?.ok) {
                reject(new Error(result?.error || 'Unable to send message.'));
                return;
              }
              resolve();
            },
          );
        });
      } else {
        const response = await apiClient.post<ChatMessage>(`/messages/conversations/${selectedId}/messages`, { content });
        if (response.error) throw new Error(response.error);
        if (response.data) setMessages((current) => [...current, response.data!]);
      }
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setSending(false);
    }
  };

  const participantName = (participant?: Participant) => participant?.profile?.displayName || participant?.profile?.username || participant?.id || 'Unknown participant';
  const participantAvatar = (participant?: Participant) => participant?.profile?.avatarUrl || '';
  const otherParty = (conversation?: Conversation) => conversation?.participant
    || (conversation ? (conversation.buyerId === userId ? conversation.seller : conversation.buyer) : undefined);
  const avatar = (participant?: Participant, className = 'h-10 w-10') => participantAvatar(participant)
    ? <img src={participantAvatar(participant)!} alt="" className={`${className} rounded-full object-cover`} />
    : <div className={`${className} flex items-center justify-center rounded-full bg-indigo-500/20 text-indigo-200`}><UserRound className="h-5 w-5" /></div>;

  return (
    <div className="mx-auto flex h-[calc(100vh-9rem)] min-h-[520px] max-w-6xl overflow-hidden rounded-2xl border border-white/10 bg-[#141420] text-white">
      <aside className="w-80 shrink-0 border-r border-white/10 bg-[#101018]">
        <div className="border-b border-white/10 p-5"><h1 className="text-xl font-bold">Messages</h1><p className="mt-1 text-sm text-slate-400">Your conversations</p></div>
        <div className="overflow-y-auto">{loading ? <p className="p-5 text-sm text-slate-500">Loading conversations...</p> : conversations.length === 0 ? <div className="p-8 text-center text-sm text-slate-500"><MessageCircle className="mx-auto mb-3 h-8 w-8 opacity-50" />No conversations yet.</div> : conversations.map((conversation) => <button key={conversation.id} onClick={() => setSelectedId(conversation.id)} className={`w-full border-b border-white/5 p-4 text-left transition ${selectedId === conversation.id ? 'bg-indigo-500/15' : 'hover:bg-white/5'}`}><div className="flex items-center gap-3">{avatar(otherParty(conversation))}<div className="min-w-0"><p className="font-medium">{participantName(otherParty(conversation))}</p><p className="truncate text-xs text-slate-500">{conversation.order?.orderNumber ? `Order #${conversation.order.orderNumber}` : 'Marketplace conversation'}</p></div></div></button>)}</div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        {!selectedId ? <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-500"><MessageCircle className="mb-4 h-12 w-12 opacity-40" /><p>Select a conversation to start chatting.</p></div> : <><div className="flex items-center gap-3 border-b border-white/10 p-5">{avatar(otherParty(conversations.find((conversation) => conversation.id === selectedId)), 'h-11 w-11')}<div><h2 className="font-semibold">{participantName(otherParty(conversations.find((conversation) => conversation.id === selectedId)))}</h2><p className="text-sm text-slate-400">Real-time messages are securely delivered.</p></div></div><div className="flex-1 overflow-y-auto p-5">{loadingMessages ? <p className="text-center text-sm text-slate-500">Loading messages...</p> : messages.length === 0 ? <p className="text-center text-sm text-slate-500">No messages yet. Say hello!</p> : messages.map((message) => <div key={message.id} className={`mb-4 flex items-end gap-2 ${message.senderId === userId ? 'justify-end' : 'justify-start'}`}>{message.senderId !== userId && avatar(message.sender, 'h-8 w-8')}<div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${message.senderId === userId ? 'bg-indigo-600 text-white' : 'bg-white/10 text-slate-200'}`}><p>{message.content || message.text}</p><p className="mt-1 text-[10px] opacity-60">{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></div>{message.senderId === userId && avatar(message.sender, 'h-8 w-8')}</div>)}<div ref={bottomRef} /></div><form onSubmit={sendMessage} className="flex gap-3 border-t border-white/10 p-4"><Input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a message..." disabled={sending} /><Button type="submit" isLoading={sending} aria-label="Send message"><Send className="h-4 w-4" /></Button></form></>}
      </main>
      {error && <div className="fixed bottom-5 right-5 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>}
    </div>
  );
}
