import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { readPendingCommand,storePendingCommand,type PendingCommand } from '@/lib/pendingCommand';
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
  status: 'draft' | 'needs_input' | 'reviewed' | 'sent' | 'blocked' | 'rendering' | 'ready' | 'failed';
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

  const [sendError,setSendError]=useState<string|null>(null);
  const [pendingCommand,setPendingCommand]=useState<PendingCommand|null>(null);
  const pendingRef=useRef<PendingCommand|null>(null);
  const sendingRef=useRef(false);
  const userRef=useRef(user?.id);userRef.current=user?.id;
  const messageSequence=useRef(0);
  const threadSequence=useRef(0);
  const [readError,setReadError]=useState<string|null>(null);
  useEffect(()=>{
    const pending=user?readPendingCommand(sessionStorage,user.id):null;
    pendingRef.current=pending;setPendingCommand(pending);setSendError(null);
    messageSequence.current++;threadSequence.current++;
    activeThreadRef.current=null;setActiveThreadId(null);setMessages([]);setDeliverables({});setThreads([]);
    sendingRef.current=false;setIsSending(false);setIsLoading(false);setReadError(null);
  },[user?.id]);
  const persistPending=useCallback((pending:PendingCommand|null)=>{
    pendingRef.current=pending;setPendingCommand(pending);
    if(user)storePendingCommand(sessionStorage,user.id,pending);
  },[user]);

  // Keep ref in sync so sendMessage always has the latest
  useEffect(() => { activeThreadRef.current = activeThreadId; }, [activeThreadId]);

  // Commit only the newest successful read for the current account/thread.
  const fetchThreads = useCallback(async () => {
    if (!user) return;
    const actor=user.id;const sequence=++threadSequence.current;
    try {
      const {data,error}=await supabase.from('agent_threads').select('*')
        .eq('thread_type','agent').order('last_message_at',{ascending:false,nullsFirst:false})
        .abortSignal(AbortSignal.timeout(15_000));
      if(error)throw error;
      if(userRef.current!==actor || sequence!==threadSequence.current)return;
      setThreads(data??[]);
    } catch {
      if(userRef.current===actor && sequence===threadSequence.current)setReadError('Conversation list could not refresh. Your last loaded list is still shown. Retry.');
    }
  },[user]);
  useEffect(()=>{void fetchThreads();},[fetchThreads]);

  const fetchMessages=useCallback(async(threadOverride?:string)=>{
    const actor=userRef.current;
    const threadId=threadOverride||activeThreadRef.current;
    const sequence=++messageSequence.current;
    if(!actor || !threadId){setMessages([]);setDeliverables({});setIsLoading(false);return;}
    const current=()=>userRef.current===actor && activeThreadRef.current===threadId && messageSequence.current===sequence;
    setIsLoading(true);
    try {
      const signal=AbortSignal.timeout(15_000);
      const {data,error}=await supabase.from('agent_messages').select('*').eq('thread_id',threadId)
        .order('created_at',{ascending:true}).abortSignal(signal);
      if(error)throw error;
      const rows=(data??[]) as ChatMessage[];
      const ids=[...new Set(rows.map(row=>row.deliverable_id).filter((id):id is string=>Boolean(id)))];
      let artifacts:Record<string,AgentDeliverable>={};
      if(ids.length){
        const {data:items,error:artifactError}=await supabase.from('agent_deliverables')
          .select('id, title, kind, status, artifact_format, file_name, mime_type, file_size_bytes, missing_fields, created_at')
          .in('id',ids).abortSignal(signal);
        if(artifactError)throw artifactError;
        artifacts=Object.fromEntries(((items??[]) as AgentDeliverable[]).map(item=>[item.id,item]));
      }
      if(current()){setMessages(rows);setDeliverables(artifacts);setReadError(null);}
    } catch {if(current())setReadError('This conversation could not refresh. Your last loaded messages are still shown. Retry.');}
    finally{if(current())setIsLoading(false);}
  },[]);
  useEffect(()=>{setMessages([]);setDeliverables({});void fetchMessages();},[fetchMessages,activeThreadId]);

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
  const sendMessage = useCallback(async (content: string, retry=false) => {
    if (!user || sendingRef.current) return;
    const previous=pendingRef.current;
    const command=previous && previous.userId===user.id && previous.content===content && (retry || previous.threadId===activeThreadRef.current)
      ? previous : {id:crypto.randomUUID(),userId:user.id,content,threadId:activeThreadRef.current,createdAt:Date.now()};
    const threadId=command.threadId;
    const actor=user.id;
    const current=()=>userRef.current===actor && pendingRef.current?.id===command.id;
    sendingRef.current=true;setIsSending(true);setSendError(null);persistPending(command);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token || session.data.session?.user.id!==actor) throw new Error('No active session');
      if(!current())return;

      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        signal:AbortSignal.timeout(125_000),
        body: JSON.stringify({
          message: toAgentText(content),
          operation_id:command.id,client_channel:'web',
          ...(threadId ? { thread_id: threadId } : {}),
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null) as {error?:string;completed_actions?:{table:string}[]} | null;
        const saved=payload?.completed_actions?.length??0;
        throw new Error(`${payload?.error || `Ari returned HTTP ${response.status}`}${saved?` ${saved} saved action receipt${saved===1?'':'s'} is available; retrying resumes this operation.`:''}`);
      }
      const data = await response.json() as { thread_id: string };
      if(!current())return;
      persistPending(null);
      setActiveThreadId(data.thread_id);
      activeThreadRef.current = data.thread_id;
      await fetchMessages(data.thread_id);
      await fetchThreads();
    } catch (err) {
      console.error('Agent error:', err);
      const raw=(err as Error).message??'';
      const friendly=/same operation|same command|saved action|command is still running/i.test(raw)?raw:
        /No active session|401|expired session/i.test(raw)?'Your session expired. Sign in again, then retry this saved command.':
        'The connection ended before the result was confirmed. Retry the saved command to resume its recorded steps.';
      if(current())setSendError(friendly);
    } finally {
      if(userRef.current===actor){sendingRef.current=false;setIsSending(false);}
    }
  }, [user, persistPending, fetchMessages, fetchThreads]);

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
    persistPending(null);setSendError(null);
    setActiveThreadId(null);
    activeThreadRef.current = null;
  }, [persistPending]);

  const activeThread = threads.find(t => t.id === activeThreadId);

  return {
    sendError,readError,pendingCommand,
    retryRead:()=>Promise.all([fetchThreads(),fetchMessages()]),
    retryPending:()=>pendingRef.current?sendMessage(pendingRef.current.content,true):Promise.resolve(),
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
