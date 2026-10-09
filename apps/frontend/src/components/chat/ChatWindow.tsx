'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { messageService } from '../../services/message.service';
import { useSocket } from '../../hooks/useSocket';
import type { Message as ApiMessage } from '../../types/api.types';
import { Check, Copy, Send, Image as ImageIcon } from 'lucide-react';

interface ChatWindowProps {
  conversationId: string;
  recipientId: string;
  recipientName: string;
  orderId?: string;
  deliveryCodes?: string[];
  onMessage?: (message: ApiMessage) => void;
  onOrderUpdate?: (update: { status: string; buyerReviewDeadline?: string | null }) => void;
}

export function ChatWindow({ conversationId, recipientId, recipientName, orderId, deliveryCodes = [], onMessage, onOrderUpdate }: ChatWindowProps) {
  const { user } = useAuthStore();
  const { socket, isConnected } = useSocket('/chat');
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chat:active', { detail: { conversationId } }));
    return () => {
      window.dispatchEvent(new CustomEvent('chat:inactive', { detail: { conversationId } }));
    };
  }, [conversationId]);

  useEffect(() => {
    let isMounted = true;
    void messageService.getMessages(conversationId)
      .then((data) => {
        if (isMounted) {
          setMessages(data);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) setLoadError(error instanceof Error ? error.message : 'Unable to load messages.');
      });

    return () => { isMounted = false; };
  }, [conversationId]);

  useEffect(() => {
    if (!isConnected || !socket) return;
    const handleMessage = (message: ApiMessage) => {
      if (message.conversationId !== conversationId) return;
      onMessage?.(message);
      setMessages((current) => current.some((item) => item.id === message.id)
        ? current
        : [...current, message]);
    };
    const handleTyping = (data: { userId: string; isTyping?: boolean }) => {
      if (data.userId === recipientId) setIsTyping(data.isTyping !== false);
    };

    socket.emit('join_conversation', conversationId);
    if (orderId) socket.emit('join_order', orderId);
    socket.on('new_message', handleMessage);
    socket.on('typing', handleTyping);
    const handleOrderUpdate = (update: { status: string; buyerReviewDeadline?: string | null }) => onOrderUpdate?.(update);
    socket.on('order_updated', handleOrderUpdate);

    return () => {
      socket.emit('leave_conversation', conversationId);
      if (orderId) socket.emit('leave_order', orderId);
      socket.off('new_message', handleMessage);
      socket.off('typing', handleTyping);
      socket.off('order_updated', handleOrderUpdate);
    };
  }, [conversationId, isConnected, onMessage, onOrderUpdate, orderId, recipientId, socket]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || !user || !socket || !isConnected) return;
    setInput('');
    socket.emit(
      'send_message',
      { conversationId, content },
      (result: { ok: boolean; error?: string }) => {
        if (!result?.ok) {
          setInput(content);
        }
      },
    );
  };

  const uploadMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !socket || !isConnected) return;
    try {
      const uploaded = await messageService.uploadEvidence(conversationId, file);
      socket.emit('send_message', {
        conversationId,
        content: '',
        messageType: uploaded.messageType,
        fileUrl: uploaded.fileUrl,
        visibility: uploaded.visibility,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to upload media.');
    }
  };

  const copyDeliveryCode = async (code: string) => {
    await navigator.clipboard.writeText(code);
    setCopiedCode(code);
    window.setTimeout(() => setCopiedCode((current) => current === code ? '' : current), 1800);
  };

  const sendTyping = (typing: boolean) => {
    if (socket && isConnected) {
      socket.emit(typing ? 'typing' : 'stop_typing', conversationId);
    }
  };

  return (
    <div className="flex h-[500px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 p-4">
        <div className="flex items-center gap-2 font-semibold text-foreground">
          <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-success' : 'bg-muted-foreground'}`} />
          {recipientName}
        </div>
      </div>
      <div className="flex-grow space-y-4 overflow-y-auto bg-background p-4">
        {loadError && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{loadError}</p>}
        {messages.map((message) => {
          const isMe = message.senderId === user?.id;
          return (
            <div key={message.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMe ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border bg-muted text-foreground'}`}>
                {message.messageType === 'IMAGE' && message.fileUrl && (
                  <img src={message.fileUrl} alt="Chat attachment" className="max-h-64 rounded-lg object-contain" />
                )}
                {message.messageType === 'VIDEO' && message.fileUrl && (
                  <video src={message.fileUrl} controls className="max-h-64 rounded-lg" />
                )}
                {(message.content ?? message.text) && <p className="text-sm">{message.content ?? message.text}</p>}
                <span className="mt-1 block text-right text-[10px] opacity-70">
                  {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          );
        })}
        {isTyping && <div className="text-sm italic text-muted-foreground">Typing...</div>}
        <div ref={bottomRef} />
      </div>
      {deliveryCodes.length > 0 && (
        <div className="border-t border-emerald-400/20 bg-emerald-500/5 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">Secure digital delivery</p>
          <div className="mt-3 space-y-2">
            {deliveryCodes.map((code) => (
              <div key={code} className="flex items-center gap-2 rounded-lg border border-emerald-400/20 bg-black/20 p-2">
                <code className="min-w-0 flex-1 break-all font-mono text-sm text-emerald-100">{code}</code>
                <button type="button" onClick={() => void copyDeliveryCode(code)} className="shrink-0 rounded-md border border-white/10 p-2 text-slate-300 hover:bg-white/10" aria-label="Copy delivery code">
                  {copiedCode === code ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      <form onSubmit={sendMessage} className="flex items-center gap-2 border-t border-border bg-card p-3">
        <label className="cursor-pointer rounded-full p-2 text-secondary-foreground hover:bg-muted hover:text-foreground" aria-label="Upload image or video">
          <input type="file" accept="image/png,image/jpeg,video/mp4,video/quicktime" className="hidden" onChange={uploadMedia} />
          <ImageIcon className="h-5 w-5" />
        </label>
        <input
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            sendTyping(event.target.value.length > 0);
          }}
          placeholder="Type a message..."
          className="flex-grow rounded-full border border-border bg-muted px-4 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
        />
        <button type="submit" disabled={!input.trim() || !isConnected} className="rounded-full bg-primary p-2 text-primary-foreground transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50">
          <Send className="ml-0.5 h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
