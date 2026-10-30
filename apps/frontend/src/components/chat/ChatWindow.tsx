'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { messageService } from '../../services/message.service';
import { useSocket } from '../../hooks/useSocket';
import type { Message as ApiMessage } from '../../types/api.types';
import { Check, Copy, Send, Image as ImageIcon } from 'lucide-react';

type ChatMessage = ApiMessage & {
  clientMessageId?: string;
  sendStatus?: 'sending' | 'sent' | 'failed';
  uploadProgress?: number;
  localPreviewUrl?: string;
};

function createClientMessageId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `message-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function compressChatImage(file: File) {
  if (!file.type.startsWith('image/')) return file;
  const image = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to prepare image for upload.');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (result) resolve(result);
        else reject(new Error('Unable to compress image for upload.'));
      }, 'image/jpeg', 0.78);
    });
    if (blob.size >= file.size && scale === 1) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } finally {
    image.close();
  }
}

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagePage, setMessagePage] = useState(1);
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [copiedCode, setCopiedCode] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const pendingScrollAdjustment = useRef<{ height: number; top: number } | null>(null);
  const suppressAutoScroll = useRef(false);
  const previewUrls = useRef(new Set<string>());

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('chat:active', { detail: { conversationId } }));
    return () => {
      window.dispatchEvent(new CustomEvent('chat:inactive', { detail: { conversationId } }));
    };
  }, [conversationId]);

  useEffect(() => {
    let isMounted = true;
    setMessagePage(1);
    setHasOlderMessages(false);
    void messageService.getMessages(conversationId, 1)
      .then((data) => {
        if (isMounted) {
          setHasOlderMessages(data.length === 50);
          setMessages((current) => [
            ...data,
            ...current.filter((message) => message.sendStatus === 'sending' || message.sendStatus === 'failed'),
          ]);
        }
      })
      .catch((error: unknown) => {
        if (isMounted) setLoadError(error instanceof Error ? error.message : 'Unable to load messages.');
      });

    return () => { isMounted = false; };
  }, [conversationId]);

  useEffect(() => () => {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current.clear();
  }, []);

  useEffect(() => {
    if (!isConnected || !socket) return;
    const handleMessage = (message: ChatMessage) => {
      if (message.conversationId !== conversationId) return;
      onMessage?.(message);
      setMessages((current) => {
        const optimisticIndex = current.findIndex((item) =>
          item.id === message.id ||
          Boolean(message.clientMessageId && item.clientMessageId === message.clientMessageId),
        );
        if (optimisticIndex < 0) return [...current, { ...message, sendStatus: 'sent' }];
        const next = [...current];
        const optimistic = next[optimisticIndex];
        if (optimistic.localPreviewUrl) {
          URL.revokeObjectURL(optimistic.localPreviewUrl);
          previewUrls.current.delete(optimistic.localPreviewUrl);
        }
        next[optimisticIndex] = { ...message, sendStatus: 'sent' };
        return next;
      });
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
    if (suppressAutoScroll.current) {
      suppressAutoScroll.current = false;
      return;
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  useLayoutEffect(() => {
    const adjustment = pendingScrollAdjustment.current;
    const list = messageListRef.current;
    if (!adjustment || !list) return;
    list.scrollTop = adjustment.top + list.scrollHeight - adjustment.height;
    pendingScrollAdjustment.current = null;
    suppressAutoScroll.current = true;
  }, [messages]);

  const loadOlderMessages = async () => {
    if (loadingOlderMessages || !hasOlderMessages) return;
    setLoadingOlderMessages(true);
    try {
      const nextPage = messagePage + 1;
      const olderMessages = await messageService.getMessages(conversationId, nextPage);
      if (olderMessages.length) {
        const list = messageListRef.current;
        if (list) pendingScrollAdjustment.current = { height: list.scrollHeight, top: list.scrollTop };
        setMessages((current) => [...olderMessages, ...current]);
        setMessagePage(nextPage);
      }
      setHasOlderMessages(olderMessages.length === 50);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unable to load older messages.');
    } finally {
      setLoadingOlderMessages(false);
    }
  };

  const sendMessage = (event: React.FormEvent) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || !user || !socket || !isConnected) return;
    const clientMessageId = createClientMessageId();
    const optimisticMessage: ChatMessage = {
      id: clientMessageId,
      clientMessageId,
      conversationId,
      senderId: user.id,
      content,
      messageType: 'TEXT',
      isRead: false,
      createdAt: new Date().toISOString(),
      sendStatus: 'sending',
    };
    setMessages((current) => [...current, optimisticMessage]);
    setInput('');
    socket.emit(
      'send_message',
      { conversationId, content, clientMessageId },
      (result: { ok: boolean; message?: ApiMessage; error?: string }) => {
        if (!result?.ok) {
          setMessages((current) => current.filter((message) => message.clientMessageId !== clientMessageId));
          setInput(content);
          setLoadError(result?.error || 'Unable to send message.');
          return;
        }
        if (!result.message) return;
        setMessages((current) => current.map((message) => message.clientMessageId === clientMessageId
          ? { ...result.message!, clientMessageId, sendStatus: 'sent' }
          : message));
      },
    );
  };

  const uploadMedia = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !user || !socket || !isConnected) return;
    const clientMessageId = createClientMessageId();
    const localPreviewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
    if (localPreviewUrl) previewUrls.current.add(localPreviewUrl);
    const optimisticMessage: ChatMessage = {
      id: clientMessageId,
      clientMessageId,
      conversationId,
      senderId: user.id,
      content: '',
      messageType: file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE',
      fileUrl: localPreviewUrl || null,
      localPreviewUrl,
      isRead: false,
      createdAt: new Date().toISOString(),
      sendStatus: 'sending',
      uploadProgress: 0,
    };
    setMessages((current) => [...current, optimisticMessage]);
    setLoadError(null);
    try {
      const uploadFile = await compressChatImage(file);
      const uploaded = await messageService.uploadEvidence(conversationId, uploadFile, 'EVERYONE', (uploadProgress) => {
        setMessages((current) => current.map((message) => message.clientMessageId === clientMessageId
          ? { ...message, uploadProgress }
          : message));
      });
      socket.emit('send_message', {
        conversationId,
        content: '',
        messageType: uploaded.messageType,
        fileUrl: uploaded.fileUrl,
        visibility: uploaded.visibility,
        clientMessageId,
      }, (result: { ok: boolean; message?: ApiMessage; error?: string }) => {
        if (!result?.ok) {
          setMessages((current) => current.map((message) => message.clientMessageId === clientMessageId
            ? { ...message, sendStatus: 'failed' }
            : message));
          setLoadError(result?.error || 'Unable to send the uploaded image.');
          return;
        }
        if (!result.message) return;
        const previewUrl = previewUrls.current.has(localPreviewUrl || '') ? localPreviewUrl : undefined;
        setMessages((current) => current.map((message) => message.clientMessageId === clientMessageId
          ? { ...result.message!, clientMessageId, sendStatus: 'sent', localPreviewUrl: previewUrl }
          : message));
      });
    } catch (error) {
      setMessages((current) => current.map((message) => message.clientMessageId === clientMessageId
        ? { ...message, sendStatus: 'failed' }
        : message));
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
      <div ref={messageListRef} className="flex-grow space-y-4 overflow-y-auto bg-background p-4">
        {loadError && <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">{loadError}</p>}
        {hasOlderMessages && (
          <div className="text-center">
            <button type="button" onClick={() => void loadOlderMessages()} disabled={loadingOlderMessages} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
              {loadingOlderMessages ? 'Loading older messages...' : 'Load older messages'}
            </button>
          </div>
        )}
        {messages.map((message) => {
          const isMe = message.senderId === user?.id;
          return (
            <div key={message.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-4 py-2 ${isMe ? 'rounded-br-sm bg-primary text-primary-foreground' : 'rounded-bl-sm border border-border bg-muted text-foreground'}`}>
                {message.messageType === 'IMAGE' && (message.localPreviewUrl || message.fileUrl) && (
                  <img src={message.localPreviewUrl || message.fileUrl || ''} alt="Chat attachment" className="max-h-64 rounded-lg object-contain" />
                )}
                {message.messageType === 'VIDEO' && message.fileUrl && (
                  <video src={message.fileUrl} controls className="max-h-64 rounded-lg" />
                )}
                {(message.content ?? message.text) && <p className="text-sm">{message.content ?? message.text}</p>}
                {message.sendStatus === 'sending' && (
                  <div className="mt-1 text-[10px] opacity-70">
                    {typeof message.uploadProgress === 'number' ? `Uploading ${message.uploadProgress}%` : 'Sending...'}
                    {typeof message.uploadProgress === 'number' && <div className="mt-1 h-1 w-full overflow-hidden rounded bg-black/20"><div className="h-full bg-current transition-[width]" style={{ width: `${message.uploadProgress}%` }} /></div>}
                  </div>
                )}
                {message.sendStatus === 'failed' && <span className="mt-1 block text-right text-[10px] text-red-300">Not sent</span>}
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
