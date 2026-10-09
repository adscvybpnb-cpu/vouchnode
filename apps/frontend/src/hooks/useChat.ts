'use client';

import { useEffect, useState } from 'react';
import { useSocket } from './useSocket';
import { useChatStore } from '../store/chat.store';

export function useChat(conversationId: string | null) {
  const { socket, isConnected } = useSocket('/chat');
  const addMessage = useChatStore(s => s.addMessage);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (!isConnected || !socket || !conversationId) return;

    socket.emit('join_conversation', conversationId);

    const handleNewMessage = (message: any) => {
      addMessage(conversationId, message);
    };

    const handleTyping = (data: { userId: string, isTyping: boolean }) => {
      setIsTyping(data.isTyping);
    };

    socket.on('new_message', handleNewMessage);
    socket.on('typing', handleTyping);

    return () => {
      socket.emit('leave_conversation', conversationId);
      socket.off('new_message', handleNewMessage);
      socket.off('typing', handleTyping);
    };
  }, [isConnected, socket, conversationId, addMessage]);

  const sendTyping = (typing: boolean) => {
    if (isConnected && socket && conversationId) {
      socket.emit('typing', { conversationId, isTyping: typing });
    }
  };

  return { isTyping, sendTyping };
}
