import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface TeamMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  avatar_url: string | null;
  email: string;
}

export interface TeamThread {
  id: string;
  org_id: string;
  user_id: string;
  title: string | null;
  thread_type: 'agent' | 'team';
  participants: string[];
  last_message_at: string | null;
  created_at: string;
  is_main?: boolean;
  dm_partner?: TeamMember;
}

export interface TeamMessage {
  id: string;
  thread_id: string;
  role: string;
  content: string;
  sender_id: string | null;
  created_at: string;
  sender_name?: string;
}

const MAIN_TITLE = 'Main';

export function useTeamChat() {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [threads, setThreads] = useState<TeamThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const senderMapRef = useRef<Record<string, TeamMember>>({});

  // ─── Fetch team members ────────────────────────────────
  const fetchMembers = useCallback(async () => {
    if (!profile?.org_id) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role, avatar_url, email')
      .eq('org_id', profile.org_id)
      .order('first_name');
    if (data) {
      setMembers(data);
      const map: Record<string, TeamMember> = {};
      for (const m of data) map[m.id] = m;
      senderMapRef.current = map;
    }
  }, [profile?.org_id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // ─── Fetch team threads ────────────────────────────────
  const fetchThreads = useCallback(async () => {
    if (!user || !profile?.org_id) return;
    setIsLoading(true);
    const { data } = await supabase
      .from('agent_threads')
      .select('*')
      .eq('thread_type', 'team')
      .eq('org_id', profile.org_id)
      .order('last_message_at', { ascending: false, nullsFirst: false });

    if (!data) { setThreads([]); setIsLoading(false); return; }

    // Only show threads where user is a participant or creator
    const myThreads = data.filter((t: TeamThread) =>
      t.user_id === user.id || (t.participants && t.participants.includes(user.id))
    );

    const enriched: TeamThread[] = myThreads.map(t => {
      const isMain = t.title === MAIN_TITLE;
      let dmPartner: TeamMember | undefined;
      if (!isMain && t.participants?.length === 2) {
        const partnerId = t.participants.find((p: string) => p !== user.id);
        if (partnerId) dmPartner = senderMapRef.current[partnerId];
      }
      return { ...t, thread_type: 'team' as const, is_main: isMain, dm_partner: dmPartner };
    });

    // Sort: Main first, then by last_message_at
    enriched.sort((a, b) => {
      if (a.is_main) return -1;
      if (b.is_main) return 1;
      const at = a.last_message_at ?? a.created_at;
      const bt = b.last_message_at ?? b.created_at;
      return bt.localeCompare(at);
    });

    setThreads(enriched);
    setIsLoading(false);
  }, [user, profile?.org_id, members]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // ─── Fetch messages for active thread ──────────────────
  const fetchMessages = useCallback(async () => {
    if (!activeThreadId) { setMessages([]); return; }
    const { data } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('thread_id', activeThreadId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data.map(m => ({
        ...m,
        sender_name: m.sender_id ? (senderMapRef.current[m.sender_id]?.first_name ?? 'Unknown') : undefined,
      })));
    }
  }, [activeThreadId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // ─── Real-time subscription ────────────────────────────
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

  // Real-time thread updates
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

  // ─── Find or create Main thread (ChatWidget) ──────────
  const openMain = useCallback(async () => {
    if (!user || !profile?.org_id) return null;
    const existing = threads.find(t => t.is_main);
    if (existing) { setActiveThreadId(existing.id); return existing.id; }

    const allIds = members.map(m => m.id);
    const { data, error } = await supabase
      .from('agent_threads')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        thread_type: 'team',
        title: MAIN_TITLE,
        participants: allIds,
      })
      .select()
      .single();

    if (error) { console.error('Error creating Main thread:', error); return null; }
    await fetchThreads();
    setActiveThreadId(data.id);
    return data.id;
  }, [user, profile?.org_id, threads, members, fetchThreads]);

  // ─── Find or create DM thread (ChatWidget) ────────────
  const openDM = useCallback(async (partnerId: string) => {
    if (!user || !profile?.org_id) return null;
    const existing = threads.find(t =>
      !t.is_main &&
      t.participants?.length === 2 &&
      t.participants.includes(user.id) &&
      t.participants.includes(partnerId)
    );
    if (existing) { setActiveThreadId(existing.id); return existing.id; }

    const partner = senderMapRef.current[partnerId];
    const { data, error } = await supabase
      .from('agent_threads')
      .insert({
        org_id: profile.org_id,
        user_id: user.id,
        thread_type: 'team',
        title: partner ? `${partner.first_name} ${partner.last_name}` : 'Direct Message',
        participants: [user.id, partnerId],
      })
      .select()
      .single();

    if (error) { console.error('Error creating DM thread:', error); return null; }
    await fetchThreads();
    setActiveThreadId(data.id);
    return data.id;
  }, [user, profile?.org_id, threads, fetchThreads]);

  // ─── Create thread (Communication page API) ────────────
  const createThread = useCallback(async (participantIds: string[], title?: string) => {
    if (!user || !profile) return null;

    // Check for existing DM
    if (participantIds.length === 1) {
      const existing = threads.find(t => {
        const parts = t.participants || [];
        return parts.length === 2 && parts.includes(user.id) && parts.includes(participantIds[0]);
      });
      if (existing) { setActiveThreadId(existing.id); return existing.id; }
    }

    const allParticipants = [user.id, ...participantIds.filter(id => id !== user.id)];
    const dmTarget = participantIds.length === 1 ? senderMapRef.current[participantIds[0]] : null;
    const threadTitle = title || (dmTarget ? `${dmTarget.first_name} ${dmTarget.last_name}` : 'Team Chat');

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
  }, [user, profile, threads, fetchThreads]);

  // ─── Create group thread (Communication page API) ──────
  const createGroupThread = useCallback(async (title: string) => {
    if (!user || !profile) return null;
    const allIds = members.map(m => m.id);
    return createThread(allIds, title);
  }, [user, profile, members, createThread]);

  // ─── Send message ──────────────────────────────────────
  const sendMessage = useCallback(async (content: string, threadId?: string) => {
    const tid = threadId || activeThreadId;
    if (!tid || !user || isSending) return;
    setIsSending(true);
    try {
      await supabase.from('agent_messages').insert({
        thread_id: tid,
        role: 'user',
        content,
        sender_id: user.id,
      });
      await supabase.from('agent_threads')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', tid);
      await fetchMessages();
      await fetchThreads();
    } catch (err) {
      console.error('Send team message error:', err);
    } finally {
      setIsSending(false);
    }
  }, [activeThreadId, user, isSending, fetchMessages, fetchThreads]);

  // ─── Helper functions (Communication page) ─────────────
  const getSenderName = useCallback((senderId: string | null) => {
    if (!senderId) return 'System';
    if (senderId === user?.id) return 'You';
    const member = senderMapRef.current[senderId];
    return member ? `${member.first_name} ${member.last_name}` : 'Unknown';
  }, [user]);

  const getSenderInitials = useCallback((senderId: string | null) => {
    if (!senderId) return '?';
    const member = senderMapRef.current[senderId];
    if (!member) return '?';
    return `${member.first_name[0]}${member.last_name[0]}`.toUpperCase();
  }, []);

  const getThreadDisplayName = useCallback((thread: TeamThread) => {
    if (thread.title) return thread.title;
    const others = (thread.participants || []).filter(id => id !== user?.id);
    return others.map(id => {
      const m = senderMapRef.current[id];
      return m ? `${m.first_name} ${m.last_name}` : 'Unknown';
    }).join(', ') || 'Team Chat';
  }, [user]);

  const activeThread = threads.find(t => t.id === activeThreadId) ?? null;

  return {
    // Shared
    threads,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    messages,
    isSending,
    isLoading,
    sendMessage,
    refresh: fetchThreads,

    // ChatWidget API
    members,
    openMain,
    openDM,

    // Communication page API
    teamMembers: members,
    senderMap: senderMapRef.current,
    createThread,
    createGroupThread,
    getSenderName,
    getSenderInitials,
    getThreadDisplayName,
  };
}
