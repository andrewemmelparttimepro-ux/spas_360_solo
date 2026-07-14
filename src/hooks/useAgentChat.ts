import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toAgentText } from '@/lib/mentions';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_name?: string;
  deliverable_id?: string | null;
  created_at: string;
}

export interface AgentDeliverable {
  id: string;
  title: string;
  kind: string;
  status: 'draft' | 'blocked' | 'rendering' | 'ready' | 'failed';
  artifact_format: 'pdf' | 'jpg' | 'png' | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  missing_fields: { field: string; reason: string; record_id?: string }[];
  created_at: string;
}

interface AgentThread {
  id: string;
  title: string | null;
  thread_type: 'agent' | 'team';
  last_message_at: string | null;
  created_at: string;
}

export function useAgentChat() {
  const { user, profile } = useAuth();
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [deliverables, setDeliverables] = useState<Record<string, AgentDeliverable>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const activeThreadRef = useRef<string | null>(null);

  // Keep ref in sync so sendMessage always has the latest
  useEffect(() => { activeThreadRef.current = activeThreadId; }, [activeThreadId]);

  // Fetch agent threads only
  const fetchThreads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('agent_threads')
      .select('*')
      .eq('thread_type', 'agent')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setThreads(data ?? []);
  }, [user]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Fetch messages for active thread
  const fetchMessages = useCallback(async (threadOverride?: string) => {
    const threadId = threadOverride || activeThreadRef.current;
    if (!threadId) { setMessages([]); setDeliverables({}); return; }
    setIsLoading(true);
    const { data } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    const rows = (data ?? []) as ChatMessage[];
    setMessages(rows);
    const ids = [...new Set(rows.map(row => row.deliverable_id).filter((id): id is string => Boolean(id)))];
    if (ids.length > 0) {
      const { data: artifactRows } = await supabase
        .from('agent_deliverables')
        .select('id, title, kind, status, artifact_format, file_name, mime_type, file_size_bytes, missing_fields, created_at')
        .in('id', ids);
      setDeliverables(Object.fromEntries(((artifactRows ?? []) as AgentDeliverable[]).map(item => [item.id, item])));
    } else {
      setDeliverables({});
    }
    setIsLoading(false);
  }, []);

  useEffect(() => { fetchMessages(); }, [fetchMessages, activeThreadId]);

  // Real-time messages
  useEffect(() => {
    if (!activeThreadId) return;
    const channel = supabase
      .channel(`agent-msg-${activeThreadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_messages',
        filter: `thread_id=eq.${activeThreadId}`,
      }, () => fetchMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeThreadId, fetchMessages]);

  // Create new agent thread
  const createThread = useCallback(async (type: 'agent' | 'team' = 'agent', title?: string) => {
    if (!user || !profile) return null;
    const { data, error } = await supabase
      .from('agent_threads')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        thread_type: type,
        title: title || 'New conversation',
      })
      .select()
      .single();
    if (error) { console.error('Error creating thread:', error); return null; }
    await fetchThreads();
    setActiveThreadId(data.id);
    activeThreadRef.current = data.id;
    return data.id;
  }, [user, profile, fetchThreads]);

  // Send message to AI agent
  const sendMessage = useCallback(async (content: string) => {
    const threadId = activeThreadRef.current;
    if (!user || isSending) return;
    setIsSending(true);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('No active session');

      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: toAgentText(content),
          ...(threadId ? { thread_id: threadId } : {}),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `Ari returned HTTP ${response.status}`);
      }
      const data = await response.json() as { thread_id: string };
      setActiveThreadId(data.thread_id);
      activeThreadRef.current = data.thread_id;
      await fetchMessages(data.thread_id);
      await fetchThreads();
    } catch (err) {
      console.error('Agent error:', err);
      // Never show raw provider JSON in the chat — translate to a human line
      const raw = (err as Error).message ?? '';
      let friendly = "Hit a snag talking to my brain — give it another shot in a moment.";
      if (/429|rate.?limit|quota|retryDelay/i.test(raw)) friendly = "I'm being rate-limited right now — give me ~30 seconds and ask again.";
      else if (/401|403|api.?key|unauthorized/i.test(raw)) friendly = "My AI connection isn't authorized — tell a manager to check the API key setup.";
      else if (/timeout|timed out|network|fetch/i.test(raw)) friendly = "Connection hiccup — try that once more.";
      if (threadId) {
        setMessages(previous => [...previous, {
          id: `local-error-${Date.now()}`,
          role: 'assistant',
          content: friendly,
          created_at: new Date().toISOString(),
        }]);
      }
    } finally {
      setIsSending(false);
    }
  }, [user, isSending, fetchMessages, fetchThreads]);

  // Delete a conversation (RLS: own threads only; messages cascade)
  const deleteThread = useCallback(async (threadId: string) => {
    const { data, error } = await supabase.from('agent_threads').delete().eq('id', threadId).select('id');
    if (error || !data || data.length === 0) return false;
    if (activeThreadRef.current === threadId) {
      setActiveThreadId(null);
      activeThreadRef.current = null;
    }
    await fetchThreads();
    return true;
  }, [fetchThreads]);

  // Fresh conversation: clear the active thread; the next send lazy-creates one
  const startNewChat = useCallback(() => {
    setActiveThreadId(null);
    activeThreadRef.current = null;
  }, []);

  const activeThread = threads.find(t => t.id === activeThreadId);

  return {
    threads,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    messages,
    deliverables,
    isLoading,
    isSending,
    createThread,
    deleteThread,
    startNewChat,
    sendMessage,
    refresh: fetchThreads,
  };
}
