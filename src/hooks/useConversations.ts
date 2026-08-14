import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { debounceRefetch } from '@/lib/realtime';
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
  // Auto-select happens once, desktop only — on phones the list is the landing view,
  // and keeping it out of fetchThreads' deps stops a full N+1 refetch per thread click.
  const activeThreadIdRef = useRef<string | null>(null);
  activeThreadIdRef.current = activeThreadId;
  const didAutoSelect = useRef(false);

  const fetchThreads = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    const { data, error } = await supabase.rpc('list_communication_threads', { p_org: profile.org_id });

    if (error) { console.error('Error fetching threads:', error); setIsLoading(false); return; }

    const enriched: ThreadWithContact[] = (data ?? []).map((t: Record<string, unknown>) => ({
      id: t.id,
      org_id: t.org_id,
      contact_id: t.contact_id,
      thread_type: t.thread_type,
      last_message_at: t.last_message_at,
      created_at: t.created_at,
      contact: {
        first_name: t.contact_first_name,
        last_name: t.contact_last_name,
        phone: t.contact_phone,
      },
      latest_message: t.latest_message ?? '',
      unread_count: Number(t.unread_count) || 0,
    })) as ThreadWithContact[];

    setThreads(enriched);
    if (
      !didAutoSelect.current &&
      !activeThreadIdRef.current &&
      enriched.length > 0 &&
      window.matchMedia('(min-width: 768px)').matches
    ) {
      didAutoSelect.current = true;
      setActiveThreadId(enriched[0].id);
    }
    setIsLoading(false);
  }, [profile]);

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
    if (!error) {
      const { error: readError } = await supabase.rpc('mark_communication_thread_read', { p_thread_id: activeThreadId });
      if (readError) console.error('Error marking conversation read:', readError);
      else setThreads(current => current.map(thread => thread.id === activeThreadId ? { ...thread, unread_count: 0 } : thread));
    }
  }, [activeThreadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Real-time: new threads / inbound texts anywhere refresh the list
  useEffect(() => {
    if (!profile) return;
    const refetch = debounceRefetch(fetchThreads); // per-thread enrichment — coalesce bursts
    const channel = supabase
      .channel(`conv-threads-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'communication_threads', filter: `org_id=eq.${profile.org_id}` }, refetch)
      .subscribe();
    return () => { refetch.cancel(); supabase.removeChannel(channel); };
  }, [profile, fetchThreads]);

  // A new inbound message may not mutate its thread row in the same transaction.
  // Refresh unread watermarks directly from message inserts, without N+1 reads.
  useEffect(() => {
    if (!profile) return;
    const refetch = debounceRefetch(fetchThreads);
    const channel = supabase
      .channel(`conv-unread-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, refetch)
      .subscribe();
    return () => { refetch.cancel(); supabase.removeChannel(channel); };
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
      return { error: `Text not sent: ${err.error ?? 'Send failed'}` };
    }

    const { error: recordError } = await supabase.from('messages').insert({
      thread_id: activeThreadId,
      sender_type: 'agent',
      sender_id: profile.id,
      body,
    });
    const { error: threadError } = await supabase
      .from('communication_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', activeThreadId);
    await fetchMessages();
    await fetchThreads();
    if (recordError || threadError) {
      // The text DID go out — say so, but never let it vanish from history silently
      return { error: `Text was sent, but saving it to the conversation failed: ${(recordError ?? threadError)!.message}` };
    }
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
