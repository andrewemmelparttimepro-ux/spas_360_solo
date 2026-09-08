import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { debounceRefetch } from '@/lib/realtime';
import { useAuth } from '@/contexts/AuthContext';
import { parseMentions, stripMentions } from '@/lib/mentions';
import { runAriChatMention } from '@/agent/ariTasks';
import { friendlyAgentError } from '@/agent/run';

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
  const [readError,setReadError]=useState<string|null>(null);
  const [sendError,setSendError]=useState<string|null>(null);
  const scope=useRef('');scope.current=user?.id??'';
  const sequences=useRef({members:0,threads:0,messages:0});
  const loaded=useRef(false);
  const sending=useRef(false);
  const pending=useRef<{id:string;thread:string;content:string;user:string}|null>(null);
  const active=useRef(activeThreadId);active.current=activeThreadId;
  useEffect(()=>{sequences.current.members++;sequences.current.threads++;sequences.current.messages++;loaded.current=false;setMembers([]);setThreads([]);setMessages([]);setActiveThreadId(null);setReadError(null);setSendError(null);pending.current=null;},[user?.id]);
  const senderMapRef = useRef<Record<string, TeamMember>>({});
  // Unique per hook instance: ChatWidget + Communication page both mount this hook,
  // and supabase-js reuses channels by topic — a second .on() after subscribe() throws.
  const instanceId = useRef(Math.random().toString(36).slice(2));

  // ─── Fetch team members ────────────────────────────────
  const fetchMembers = useCallback(async () => {
    if (!profile?.org_id) return;
    const request=++sequences.current.members;const account=scope.current;
    const { data,error } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, role, avatar_url, email')
      .eq('org_id', profile.org_id)
      .order('first_name').abortSignal(AbortSignal.timeout(15000));
    if(request!==sequences.current.members||account!==scope.current)return;
    if(error){setReadError('Team members could not refresh. The last loaded list is shown.');return;}
    if (data) {
      setMembers(data);
      const map: Record<string, TeamMember> = {};
      for (const m of data) map[m.id] = m;
      senderMapRef.current = map;
    }
  }, [profile?.org_id,user?.id]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  // ─── Fetch team threads ────────────────────────────────
  const fetchThreads = useCallback(async () => {
    if (!user || !profile?.org_id) return;
    const request=++sequences.current.threads;const account=scope.current;
    if(!loaded.current)setIsLoading(true);
    // Participation is filtered server-side — clients never download the
    // whole org's DM metadata just to throw most of it away.
    const { data, error } = await supabase
      .from('agent_threads')
      .select('*')
      .eq('thread_type', 'team')
      .eq('org_id', profile.org_id)
      .or(`user_id.eq.${user.id},participants.cs.{${user.id}}`)
      .order('last_message_at', { ascending: false, nullsFirst: false }).abortSignal(AbortSignal.timeout(15000));
    if(request!==sequences.current.threads||account!==scope.current)return;

    if (error) { setReadError('Conversations could not refresh. The last loaded list is shown. Retry loading.'); setIsLoading(false); return; }
    if (!data) { setThreads([]); setIsLoading(false); return; }

    const myThreads = data as TeamThread[];

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

    loaded.current=true;
    setThreads(enriched);
    setIsLoading(false);
  }, [user, profile?.org_id, members]);

  useEffect(() => { fetchThreads(); }, [fetchThreads]);

  // ─── Fetch messages for active thread ──────────────────
  const fetchMessages = useCallback(async () => {
    if (!activeThreadId) { setMessages([]); return; }
    const request=++sequences.current.messages;const account=scope.current;
    const { data,error } = await supabase
      .from('agent_messages')
      .select('*')
      .eq('thread_id', activeThreadId)
      .order('created_at', { ascending: true }).abortSignal(AbortSignal.timeout(15000));
    if(request!==sequences.current.messages||account!==scope.current||activeThreadId!==active.current)return;
    if(error){setReadError('Messages could not refresh. The last loaded messages are shown. Retry loading.');return;}

    if (data) {
      setMessages(data.map(m => ({
        ...m,
        sender_name: m.role === 'assistant' ? 'Ari'
          : m.sender_id ? (senderMapRef.current[m.sender_id]?.first_name ?? 'Unknown') : undefined,
      })));
    }
  }, [activeThreadId,user?.id]);

  useEffect(() => {setMessages([]);void fetchMessages();return()=>{sequences.current.messages++;};}, [fetchMessages]);

  // ─── Real-time subscription ────────────────────────────
  useEffect(() => {
    if (!activeThreadId) return;
    const channel = supabase
      .channel(`team-msg-${activeThreadId}-${instanceId.current}`)
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
    const refetch = debounceRefetch(fetchThreads);
    const channel = supabase
      .channel(`team-threads-rt-${instanceId.current}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'agent_threads',
        filter: `org_id=eq.${profile.org_id}`,
      }, refetch)
      .subscribe();
    return () => { refetch.cancel(); supabase.removeChannel(channel); };
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

    if (error) { setSendError('The conversation could not open. Retry loading before creating another.'); return null; }
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

    if (error) { setSendError('The conversation could not open. Retry loading before creating another.'); return null; }
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
        if (t.is_main) return false; // Main channel is not a DM, even with 2 members
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

    if (error) { setSendError('The conversation could not open. Retry loading before creating another.'); return null; }
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

  // ─── @Ari in a channel: he answers right in the thread ──
  const [ariThinking, setAriThinking] = useState(false);
  const summonAri = useCallback(async (tid: string, content: string, channelTitle: string) => {
    const senderName = profile ? `${profile.first_name} ${profile.last_name}` : 'A teammate';
    setAriThinking(true);
    try {
      const recentLines = messages.slice(-8)
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => `${m.role === 'assistant' ? 'Ari' : (m.sender_name ?? 'Teammate')}: ${stripMentions(m.content)}`);
      const reply = await runAriChatMention({ threadId: tid, channelTitle, senderName, message: content, recentLines });
      // The server saves the answer with the operation receipt.
    } catch (err) {
      setSendError(friendlyAgentError((err as Error).message??''));
    } finally {
      setAriThinking(false);
      await fetchMessages();
      await fetchThreads();
    }
  }, [profile, messages, fetchMessages, fetchThreads]);

  // Message identity survives lost responses. Retrying this draft reuses it;
  // receipts live in the saved message, so notices are not sent twice.
  const sendMessage = useCallback(async (content: string, threadId?: string):Promise<boolean> => {
    const tid=threadId||activeThreadId;
    if(!tid||!user||sending.current)return false;
    const account=user.id;
    const key=`spas:pending-team:${account}:${tid}`;
    if(!pending.current){try{pending.current=JSON.parse(sessionStorage.getItem(key)||'null');}catch{/* storage optional */}}
    if(pending.current?.user!==account||pending.current.thread!==tid||pending.current.content!==content)pending.current={id:crypto.randomUUID(),thread:tid,content,user:account};
    const item=pending.current;
    try{sessionStorage.setItem(key,JSON.stringify(item));}catch{/* retain in memory */}
    sending.current=true;setIsSending(true);setSendError(null);
    try{
      const {error}=await supabase.rpc('send_team_message_once',{p_id:item.id,p_thread:tid,p_content:content}).abortSignal(AbortSignal.timeout(20000));
      if(error)throw error;
      try{sessionStorage.removeItem(key);}catch{/* optional */}
      pending.current=null;
      if(scope.current!==account)return true;
      await Promise.all([fetchMessages(),fetchThreads()]);
      const thread=threads.find(t=>t.id===tid);
      if(parseMentions(content).ari)void summonAri(tid,content,thread?.title||'Team chat');
      return true;
    }catch{
      if(scope.current===account)setSendError('The message is not confirmed saved. Your draft is kept. Retry the unchanged message to check its original receipt without sending it twice.');
      return false;
    }finally{sending.current=false;if(scope.current===account)setIsSending(false);}
  },[activeThreadId,user,threads,fetchMessages,fetchThreads,summonAri]);
  const retryRead=useCallback(async()=>{setReadError(null);await Promise.all([fetchMembers(),fetchThreads(),fetchMessages()]);},[fetchMembers,fetchThreads,fetchMessages]);

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
    readError,sendError,retryRead,
    threads,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    messages,
    isSending,
    ariThinking,
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
