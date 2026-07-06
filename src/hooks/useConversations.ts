import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { CommunicationThread, Message, Contact } from '@/types/database';

type ThreadWithContact = CommunicationThread & {
  contact: Pick<Contact, 'first_name' | 'last_name' | 'phone'>;
  latest_message?: string;
  unread_count: number;
};

export function useConversations() {
  const { profile } = useAuth();
  const [threads, setThreads] = useState<ThreadWithContact[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchThreads = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    const { data, error } = await supabase
      .from('communication_threads')
      .select('*, contacts:contact_id(first_name, last_name, phone)')
      .eq('org_id', profile.org_id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (error) { console.error('Error fetching threads:', error); setIsLoading(false); return; }

    // Enrich with latest message
    const enriched: ThreadWithContact[] = await Promise.all(
      (data ?? []).map(async (t: Record<string, unknown>) => {
        const { data: msgs } = await supabase
          .from('messages')
          .select('body')
          .eq('thread_id', t.id as string)
          .order('created_at', { ascending: false })
          .limit(1);

        return {
          ...t,
          contact: t.contacts as ThreadWithContact['contact'],
          latest_message: msgs?.[0]?.body ?? '',
          unread_count: 0, // TODO: implement read tracking
        } as ThreadWithContact;
      })
    );

    setThreads(enriched);
    if (!activeThreadId && enriched.length > 0) {
      setActiveThreadId(enriched[0].id);
    }
    setIsLoading(false);
  }, [profile, activeThreadId]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Fetch messages for active thread
  const fetchMessages = useCallback(async () => {
    if (!activeThreadId) return;
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', activeThreadId)
      .order('created_at', { ascending: true });
    if (error) console.error('Error fetching messages:', error);
    setMessages(data ?? []);
  }, [activeThreadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Real-time: new threads / inbound texts anywhere refresh the list
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`conv-threads-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communication_threads' }, () => fetchThreads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchThreads]);

  // Real-time messages
  useEffect(() => {
    if (!activeThreadId) return;
    const channel = supabase
      .channel(`messages-${activeThreadId}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `thread_id=eq.${activeThreadId}`,
      }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeThreadId, fetchMessages]);

  const sendMessage = useCallback(async (body: string): Promise<{ error: string | null }> => {
    if (!activeThreadId || !profile) return { error: 'No conversation selected' };
    const thread = threads.find(t => t.id === activeThreadId);
    if (!thread?.contact?.phone) return { error: 'Contact has no phone number' };

    // Send through the business number first — only record what actually went out
    const session = await supabase.auth.getSession();
    const resp = await fetch('/api/sms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.data.session?.access_token}`,
      },
      body: JSON.stringify({ to: thread.contact.phone, body }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ error: 'Send failed' }));
      return { error: err.error ?? 'Send failed' };
    }

    await supabase.from('messages').insert({
      thread_id: activeThreadId,
      sender_type: 'agent',
      sender_id: profile.id,
      body,
    });
    await supabase
      .from('communication_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', activeThreadId);
    await fetchMessages();
    await fetchThreads();
    return { error: null };
  }, [activeThreadId, threads, profile, fetchMessages, fetchThreads]);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

  return {
    threads,
    activeThread,
    setActiveThreadId,
    messages,
    isLoading,
    sendMessage,
    refresh: fetchThreads,
  };
}
