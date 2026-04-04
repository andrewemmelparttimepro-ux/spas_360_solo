import { useState } from 'react';
import { conversations, messagesByConversation } from '@/data/communication';
import type { Conversation, Message } from '@/types';

export function useConversations() {
  const [activeChat, setActiveChat] = useState<Conversation>(conversations[0]);

  const messages: Message[] = messagesByConversation[activeChat.id] ?? [];

  return {
    conversations,
    activeChat,
    setActiveChat,
    messages,
    isLoading: false,
  };
}
