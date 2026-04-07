// fiximport { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { Profile } from '@/types/database';

export interface TeamThread {
  id: string;
  org_id: string;
  user_id: string;
  thread_type: 'agent' | 'team';
  title: string | null;
  participants: string[];
  last_message_at: string | null;
  created_at: string;
}

export interface TeamMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  sender_id: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  email: string;
  avatar_url: string | null;
}

export function useTeamChat() {
  const { user, profile } = useAuth();
  const [threads, setThreads] = useState<TeamThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [senderMap, setSenderMap] = useState<Record<string, TeamMember>>({});

  // Fetch all team members in the org
  const fetchTeamMembers = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role, email, avatar_url')
      .eq('org_id', profile.org_id)
      .order('first_name');
    if (error) { console.error('Error fetching team:', error); return; }
    const members = (data ?? []) as TeamMember[];
    setTeamMembers(members);
    const map: Record<string, TeamMember> = {};
    members.forEach(m => { map[m.id] = m; });
    setSenderMap(map);
  }, [profile]);

  // Fetch team threads (thread_type = 'team')
  const fetchThreads = useCallback(async () => {
    if (!profile || !user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from('agent_threads')
      .select('*')
      .eq('org_id', profile.org_id)
      .eq('thread_type', 'team')
      .order('last_message_at', { ascending: false, nullsFirst: false });
    if (error) { console.error('Error fetching team threads:', error); setIsLoading(false); return; }

    // Only show threads where user is a participant (or created by user)
    const myThreads = (data ?? []).filter((t: TeamThread) =>
      t.user_id === user.id ||
      (t.participants && t.participants.includes(user.id))
    );
    setThreads(myThreads);
    setIsLoading(false);
  }, [profile, user]);

  useEffect(() => { fetchTeamMembers(); }, [fetchTeamMembers]);
  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // Fetch messages for active thread
  const fetchMessages = useCallback(async () => {
    if (!activeThreadId) { setMessages([]); return; }
    const { data, error } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('thread_id', activeThreadId)
      .order('created_at', { ascending: true });
    if (error) console.error('Error fetching messages:', error);
    setMessages((data ?? []) as TeamMessage[]);
  }, [activeThreadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Real-time subscriptions for messages and threads
  useEffect(() => {
    if (!activeThreadId) return;
    const channel = supabase
      .channel(`team-msg-${activeThreadId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'agent_messages',
        filter: `thread_id=eq.${activeThreadId}`,
      }, () => fetchMessages())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeThreadId, fetchMessages]);

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('team-threads-rt')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_threads',
      }, () => fetchThreads())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchThreads]);

  // Send a team message (no AI — just persist)
  const sendMessage = useCallback(async (content: string) => {
    if (!activeThreadId || !user) return;
    await supabase.from('agent_messages').insert({
      thread_id: activeThreadId,
      role: 'user',
      content,
      sender_id: user.id,
    });
    await supabase
      .from('agent_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', activeThreadId);
    await fetchMessages();
    await fetchThreads();
  }, [activeThreadId, user, fetchMessages, fetchThreads]);

  // Create a new team thread (group or DM)
  const createThread = useCallback(async (participantIds: string[], title?: string) => {
    if (!user || !profile) return null;

    // Check if a DM thread already exists between exactly these two users
    if (participantIds.length === 1) {
      const existing = threads.find(t => {
        const parts = t.participants || [];
        return parts.length === 2 &&
          parts.includes(user.id) &&
          parts.includes(participantIds[0]);
      });
      if (existing) {
        setActiveThreadId(existing.id);
        return existing.id;
      }
    }

    const allParticipants = [user.id, ...participantIds.filter(id => id !== user.id)];
    const dmTarget = participantIds.length === 1 ? senderMap[participantIds[0]] : null;
    const threadTitle = title || (dmTarget
      ? `${dmTarget.first_name} ${dmTarget.last_name}`
      : `Team Chat`);

    const { data, error } = await supabase
      .from('agent_threads')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        thread_type: 'team',
        title: threadTitle,
        participants: allParticipants,
        last_message_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) { console.error('Error creating thread:', error); return null; }
    await fetchThreads();
    setActiveThreadId(data.id);
    return data.id;
  }, [user, profile, threads, senderMap, fetchThreads]);

  // Create a group thread with all team members
  const createGroupThread = useCallback(async (title: string) => {
    if (!user || !profile) return null;
    const allIds = teamMembers.map(m => m.id);
    return createThread(allIds, title);
  }, [user, profile, teamMembers, createThread]);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

  // Get display name for a sender
  const getSenderName = useCallback((senderId: string | null) => {
    if (!senderId) return 'System';
    if (senderId === user?.id) return 'You';
    const member = senderMap[senderId];
    return member ? `${member.first_name} ${member.last_name}` : 'Unknown';
  }, [user, senderMap]);

  // Get initials for avatar
  const getSenderInitials = useCallback((senderId: string | null) => {
    if (!senderId) return '?';
    const member = senderMap[senderId];
    if (!member) return '?';
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }, [senderMap]);

  // Get other participants' names for thread display
  const getThreadDisplayName = useCallback((thread: TeamThread) => {
    if (thread.title) return thread.title;
    const others = (thread.participants || []).filter(id => id !== user?.id);
    return others.map(id => {
      const m = senderMap[id];
      return m ? `${m.first_name} ${m.last_name}` : 'Unknown';
    }).join(', ') || 'Team Chat';
  }, [user, senderMap]);

  return {
    threads,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    messages,
    teamMembers,
    isLoading,
    sendMessage,
    createThread,
    createGroupThread,
    getSenderName,
    getSenderInitials,
    getThreadDisplayName,
    senderMap,
    refresh: fetchThreads,
  };
}
