'use client';

import { useEffect, useMemo, useState } from 'react';
import { messageService } from '../../services/message.service';
import { useAuthStore } from '../../store/auth.store';
import type { Conversation } from '../../types/api.types';
import { ChatWindow } from './ChatWindow';

const displayName = (participant?: Conversation['buyer']) =>
  participant?.profile?.displayName || participant?.profile?.username || participant?.id || 'Unknown participant';

export function ConversationList({ initialConversationId }: { initialConversationId?: string }) {
  const user = useAuthStore((state) => state.user);
  const [mounted, setMounted] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    let isMounted = true;
    if (!user?.id) {
      setConversations([]);
      setLoading(false);
      return () => {
        isMounted = false;
      };
    }
    void messageService.getConversations()
      .then((items) => {
        if (!isMounted) return;
        setConversations(items);
        setActiveId((current) => current && items.some((item) => item.id === current)
          ? current
          : initialConversationId && items.some((item) => item.id === initialConversationId)
            ? initialConversationId
            : items[0]?.id || null);
      })
      .catch((reason: unknown) => {
        if (isMounted) setError(reason instanceof Error ? reason.message : 'Unable to load conversations.');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });
    return () => {
      isMounted = false;
    };
  }, [initialConversationId, mounted, user?.id]);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === activeId),
    [activeId, conversations],
  );
  const recipient = activeConversation
    ? activeConversation.buyer?.id === user?.id ? activeConversation.seller : activeConversation.buyer
    : undefined;

  if (!mounted || loading) return <div className="p-8 text-center text-muted-foreground">Loading conversations...</div>;
  if (error) return <div className="p-8 text-center text-destructive">{error}</div>;
  if (!conversations.length) return <div className="p-8 text-center text-muted-foreground">No conversations yet.</div>;

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {conversations.map((conversation) => {
          const participant = conversation.buyer?.id === user?.id ? conversation.seller : conversation.buyer;
          return (
            <button
              key={conversation.id}
              type="button"
              onClick={() => setActiveId(conversation.id)}
              className={`w-full p-4 text-left transition-colors ${conversation.id === activeId ? 'bg-muted' : 'hover:bg-muted/50'}`}
            >
              <p className="font-medium text-foreground">{displayName(participant)}</p>
              <p className="mt-1 truncate text-xs text-muted-foreground">{conversation.lastMessage?.content || 'No messages yet'}</p>
            </button>
          );
        })}
      </aside>
      <section>
        {activeConversation && recipient && (
          <ChatWindow
            conversationId={activeConversation.id}
            recipientId={recipient.id}
            recipientName={displayName(recipient)}
          />
        )}
      </section>
    </div>
  );
}
