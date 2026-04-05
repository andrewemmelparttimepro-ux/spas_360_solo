import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { SALES_AGENT_PROMPT } from '@/agent/system-prompt';
import { getOpenAITools, executeTool } from '@/agent/tools';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_name?: string;
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
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Fetch threads
  const fetchThreads = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from('agent_threads')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    setThreads(data ?? []);
  }, [user]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Fetch messages for active thread
  const fetchMessages = useCallback(async () => {
    if (!activeThreadId) { setMessages([]); return; }
    setIsLoading(true);
    const { data } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('thread_id', activeThreadId)
      .order('created_at', { ascending: true });
    setMessages(data ?? []);
    setIsLoading(false);
  }, [activeThreadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

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

  // Create new thread
  const createThread = useCallback(async (type: 'agent' | 'team' = 'agent', title?: string) => {
    if (!user || !profile) return null;
    const { data, error } = await supabase
      .from('agent_threads')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        thread_type: type,
        title: title || (type === 'agent' ? 'New conversation' : 'Team chat'),
      })
      .select()
      .single();
    if (error) { console.error('Error creating thread:', error); return null; }
    await fetchThreads();
    setActiveThreadId(data.id);
    return data.id;
  }, [user, profile, fetchThreads]);

  // Send message to agent
  const sendMessage = useCallback(async (content: string) => {
    if (!activeThreadId || !user || isSending) return;
    setIsSending(true);

    // Save user message
    await supabase.from('agent_messages').insert({
      thread_id: activeThreadId,
      role: 'user',
      content,
      sender_id: user.id,
    });

    // Build message history for LLM
    const history = [
      { role: 'system' as const, content: SALES_AGENT_PROMPT },
      ...messages.filter(m => m.role !== 'tool').map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user' as const, content },
    ];

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages: history,
          tools: getOpenAITools(),
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new Error(err);
      }

      const data = await response.json();
      let assistantMessage = data.choices?.[0]?.message;

      // Handle tool calls
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        // Save assistant's tool-calling message
        await supabase.from('agent_messages').insert({
          thread_id: activeThreadId,
          role: 'assistant',
          content: assistantMessage.content || 'Using tools...',
          tool_calls: assistantMessage.tool_calls,
        });

        // Execute each tool
        const toolResults = [];
        for (const tc of assistantMessage.tool_calls) {
          const args = JSON.parse(tc.function.arguments);
          const result = await executeTool(tc.function.name, args);
          toolResults.push({
            role: 'tool' as const,
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });

          // Save tool result
          await supabase.from('agent_messages').insert({
            thread_id: activeThreadId,
            role: 'tool',
            content: JSON.stringify(result),
            tool_name: tc.function.name,
          });
        }

        // Second LLM call with tool results
        const followUp = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: [
              ...history,
              assistantMessage,
              ...toolResults,
            ],
            tools: getOpenAITools(),
          }),
        });

        if (followUp.ok) {
          const followUpData = await followUp.json();
          assistantMessage = followUpData.choices?.[0]?.message;
        }
      }

      // Save final assistant response
      if (assistantMessage?.content) {
        await supabase.from('agent_messages').insert({
          thread_id: activeThreadId,
          role: 'assistant',
          content: assistantMessage.content,
        });
      }

      // Update thread title from first message
      if (messages.length === 0) {
        const title = content.length > 40 ? content.slice(0, 40) + '...' : content;
        await supabase.from('agent_threads').update({ title, last_message_at: new Date().toISOString() }).eq('id', activeThreadId);
      } else {
        await supabase.from('agent_threads').update({ last_message_at: new Date().toISOString() }).eq('id', activeThreadId);
      }

      await fetchMessages();
      await fetchThreads();
    } catch (err) {
      console.error('Agent error:', err);
      await supabase.from('agent_messages').insert({
        thread_id: activeThreadId,
        role: 'assistant',
        content: `Sorry, I encountered an error. Please try again. (${(err as Error).message})`,
      });
      await fetchMessages();
    } finally {
      setIsSending(false);
    }
  }, [activeThreadId, user, messages, isSending, fetchMessages, fetchThreads]);

  // Send team message (no LLM, just persist)
  const sendTeamMessage = useCallback(async (content: string) => {
    if (!activeThreadId || !user) return;
    await supabase.from('agent_messages').insert({
      thread_id: activeThreadId,
      role: 'user',
      content,
      sender_id: user.id,
    });
    await supabase.from('agent_threads').update({ last_message_at: new Date().toISOString() }).eq('id', activeThreadId);
  }, [activeThreadId, user]);

  const activeThread = threads.find(t => t.id === activeThreadId);

  return {
    threads,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    messages,
    isLoading,
    isSending,
    createThread,
    sendMessage,
    sendTeamMessage,
    refresh: fetchThreads,
  };
}
