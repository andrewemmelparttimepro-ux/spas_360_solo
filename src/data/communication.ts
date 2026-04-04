import type { Conversation, Message } from '@/types';

export const conversations: Conversation[] = [
  { id: 'c1', name: 'John Wyant', lastMessage: 'Sounds good, see you Tuesday.', time: '10:42 AM', unread: 0, type: 'sms' },
  { id: 'c2', name: 'Sarah Johnson', lastMessage: 'Has my part arrived yet?', time: '09:15 AM', unread: 2, type: 'sms' },
  { id: 'c3', name: 'Mike Smith', lastMessage: 'Invoice #1042 paid', time: 'Yesterday', unread: 0, type: 'email' },
  { id: 'c4', name: 'Emily Davis', lastMessage: 'Can we reschedule the delivery?', time: 'Yesterday', unread: 1, type: 'sms' },
  { id: 'c5', name: 'Robert Miller', lastMessage: 'Thanks for the quick repair!', time: 'Mon', unread: 0, type: 'sms' },
];

export const messagesByConversation: Record<string, Message[]> = {
  'c1': [
    { id: 'm1', sender: 'system', text: 'Automated: Your delivery is scheduled for Tuesday between 9am-11am.', time: 'Yesterday 2:00 PM' },
    { id: 'm2', sender: 'customer', text: 'Great, I will make sure the gate is unlocked.', time: 'Yesterday 2:15 PM' },
    { id: 'm3', sender: 'agent', text: 'Perfect. Our tech Bryson will call you when he is 30 mins away.', time: 'Yesterday 2:20 PM' },
    { id: 'm4', sender: 'customer', text: 'Sounds good, see you Tuesday.', time: '10:42 AM' },
  ],
};
