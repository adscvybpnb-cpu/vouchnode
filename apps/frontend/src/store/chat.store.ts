import { create } from 'zustand';
import type { Message, Conversation } from '../types/api.types';

interface ChatStore {
  activeConversationId: string | null;
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  setActiveConversation: (id: string | null) => void;
  addMessage: (conversationId: string, message: Message) => void;
  setMessages: (conversationId: string, messages: Message[]) => void;
  markConversationRead: (conversationId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  activeConversationId: null,
  conversations: [],
  messages: {},
  setActiveConversation: (id) => set({ activeConversationId: id }),
  addMessage: (cid, msg) => set((state) => ({
    messages: { ...state.messages, [cid]: [...(state.messages[cid] || []), msg] }
  })),
  setMessages: (cid, msgs) => set((state) => ({
    messages: { ...state.messages, [cid]: msgs }
  })),
  markConversationRead: (cid) => set((state) => ({
    conversations: state.conversations.map(c => c.id === cid ? { ...c, unreadCount: 0 } : c)
  }))
}));
