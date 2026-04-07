import { Search, Phone, Mail, Send, Paperclip, MoreVertical, Users, MessageSquare, Plus, UserPlus, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConversations } from '@/hooks/useConversations';
import { useTeamChat, type TeamThread } from '@/hooks/useTeamChat';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { useState, useRef, useEffect } from 'react';

type Tab = 'team' | 'customers';

// âââ Avatar helper âââ
function Avatar({ initials, color, small }: { initials: string; color: string; small?: boolean }) {
  return (
    <div className={cn(
      "shrink-0 rounded-full flex items-center justify-center font-bold text-white",
      small ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs",
      color
    )}>
      {initials}
    </div>
  );
}

const AVATAR_COLORS = [
  'bg-sky-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-orange-500',
];

function colorForId(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// âââ Team Chat Panel âââ
function TeamChatPanel() {
  const {
    threads, activeThread, activeThreadId, setActiveThreadId,
    messages, teamMembers, isLoading, sendMessage,
    createThread, createGroupThread,
    getSenderName, getSenderInitials, getThreadDisplayName, senderMap,
  } = useTeamChat();
  const { user } = useAuth();
  const { toast } = useToast();
  const [draft, setDraft] = useState('');
  const [showNewDM, setShowNewDM] = useState(false);
  const [search, setSearch] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim()) return;
    if (!activeThreadId) {
      toast('Select or start a conversation first', 'warning');
      return;
    }
    await sendMessage(draft);
    setDraft('');
  };

  const handleStartDM = async (memberId: string) => {
    await createThread([memberId]);
    setShowNewDM(false);
    toast('Conversation started', 'success');
  };

  const handleNewGroup = async () => {
    await createGroupThread('Team Channel');
    toast('Team channel created', 'success');
  };

  const otherMembers = teamMembers.filter(m => m.id !== user?.id);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar: Threads + Team */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0">
        <div className="p-3 border-b border-slate-200 flex items-center gap-2">
          <button
            onClick={() => setShowNewDM(!showNewDM)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors"
          >
            <UserPlus className="w-4 h-4" /> New Message
          </button>
          <button
            onClick={handleNewGroup}
            className="p-2 text-slate-500 hover:bg-slate-200 rounded-lg transition-colors"
            title="New team channel"
          >
            <Hash className="w-4 h-4" />
          </button>
        </div>

        {/* New DM picker */}
        {showNewDM && (
          <div className="border-b border-slate-200 bg-white p-3 space-y-1">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Send to:</p>
            {otherMembers.map(m => (
              <button
                key={m.id}
                onClick={() => handleStartDM(m.id)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-sky-50 transition-colors text-left"
              >
                <Avatar initials={`${m.first_name[0]}${m.last_name[0]}`} color={colorForId(m.id)} small />
                <div>
                  <p className="text-sm font-medium text-slate-800">{m.first_name} {m.last_name}</p>
                  <p className="text-[10px] text-slate-400 capitalize">{m.role.replace('_', ' ')}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        <div className="p-3 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text" placeholder="Search conversations..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-sky-400 outline-none"
            />
          </div>
        </div>

        {/* Thread list */}
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-400">No conversations yet</p>
              <p className="text-xs text-slate-400 mt-1">Click "New Message" to start</p>
            </div>
          ) : threads
            .filter(t => !search || (getThreadDisplayName(t).toLowerCase().includes(search.toLowerCase())))
            .map(thread => {
              const isActive = thread.id === activeThreadId;
              const isGroup = (thread.participants || []).length > 2;
              return (
                <div
                  key={thread.id}
                  onClick={() => setActiveThreadId(thread.id)}
                  className={cn(
                    "p-3 border-b border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors flex items-center gap-3",
                    isActive ? "bg-white border-l-4 border-l-sky-400" : "border-l-4 border-l-transparent"
                  )}
                >
                  {isGroup ? (
                    <div className="w-9 h-9 rounded-full bg-slate-300 flex items-center justify-center shrink-0">
                      <Users className="w-4 h-4 text-white" />
                    </div>
                  ) : (
                    <Avatar
                      initials={getThreadDisplayName(thread).split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                      color={colorForId(thread.id)}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <h3 className="text-sm font-medium text-slate-900 truncate">{getThreadDisplayName(thread)}</h3>
                      {thread.last_message_at && (
                        <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                          {new Date(thread.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">{isGroup ? 'Team Channel' : 'Direct Message'}</p>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col bg-white">
        {activeThread ? (
          <>
            {/* Header */}
            <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
              <div className="flex items-center gap-3">
                {(activeThread.participants || []).length > 2 ? (
                  <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
                    <Users className="w-5 h-5 text-slate-500" />
                  </div>
                ) : (
                  <Avatar
                    initials={getThreadDisplayName(activeThread).split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                    color={colorForId(activeThread.id)}
                  />
                )}
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{getThreadDisplayName(activeThread)}</h2>
                  <p className="text-xs text-slate-500">
                    {(activeThread.participants || []).length} participants
                  </p>
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/50">
              {messages.length === 0 ? (
                <div className="text-center py-12">
                  <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">No messages yet â say hello!</p>
                </div>
              ) : messages.map(msg => {
                const isMe = msg.sender_id === user?.id;
                const senderName = getSenderName(msg.sender_id);
                const initials = getSenderInitials(msg.sender_id);
                return (
                  <div key={msg.id} className={cn("flex gap-3", isMe ? "flex-row-reverse" : "flex-row")}>
                    {!isMe && (
                      <Avatar initials={initials} color={colorForId(msg.sender_id || '')} small />
                    )}
                    <div className={cn("max-w-[70%]", isMe ? "text-right" : "text-left")}>
                      {!isMe && <p className="text-[10px] font-medium text-slate-500 mb-1 px-1">{senderName}</p>}
                      <div className={cn(
                        "rounded-2xl px-4 py-2.5 text-sm inline-block",
                        isMe
                          ? "bg-sky-500 text-white rounded-tr-md"
                          : "bg-white border border-slate-200 text-slate-800 rounded-tl-md"
                      )}>
                        {msg.content}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-1 px-1">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={chatEndRef} />
            </div>

            {/* Compose */}
            <div className="p-4 border-t border-slate-200 bg-white shrink-0">
              <div className="flex items-end space-x-2">
                <div className="flex-1 bg-slate-100 rounded-xl border border-transparent focus-within:border-sky-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-sky-400 transition-all">
                  <textarea
                    rows={2}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Type a message..."
                    className="w-full bg-transparent border-none p-3 text-sm outline-none resize-none"
                  />
                </div>
                <button
                  onClick={handleSend}
                  className="p-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl transition-colors shrink-0 shadow-sm"
                >
                  <Send className="w-5 h-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Users className="w-12 h-12 text-slate-300" />
            <p className="text-lg font-medium">Team Communication</p>
            <p className="text-sm">Select a conversation or start a new one</p>
          </div>
        )}
      </div>
    </div>
  );
}

// âââ Customer Messages Panel (original) âââ
function CustomerPanel() {
  const { threads, activeThread, setActiveThreadId, messages, isLoading, sendMessage } = useConversations();
  const [draft, setDraft] = useState('');

  const handleSend = async () => {
    if (!draft.trim()) return;
    await sendMessage(draft);
    setDraft('');
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Thread List */}
      <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" placeholder="Search messages..." className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-sky-400 outline-none" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No customer conversations yet</p>
          ) : threads.map(thread => (
            <div
              key={thread.id}
              onClick={() => setActiveThreadId(thread.id)}
              className={cn("p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors",
                activeThread?.id === thread.id ? "bg-white border-l-4 border-l-sky-400" : "border-l-4 border-l-transparent"
              )}
            >
              <div className="flex justify-between items-start mb-1">
                <h3 className="text-sm font-medium text-slate-900">{thread.contact.first_name} {thread.contact.last_name}</h3>
                <span className="text-xs text-slate-500">{thread.last_message_at ? new Date(thread.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
              </div>
              <p className="text-xs text-slate-500 truncate">{thread.latest_message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col bg-white">
        {activeThread ? (
          <>
            <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{activeThread.contact.first_name} {activeThread.contact.last_name}</h2>
                <p className="text-xs text-slate-500 flex items-center"><Phone className="w-3 h-3 mr-1" />{activeThread.contact.phone}</p>
              </div>
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"><MoreVertical className="w-5 h-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
              {messages.map(msg => (
                <div key={msg.id} className={cn("flex flex-col", msg.sender_type === 'customer' ? "items-start" : "items-end")}>
                  <div className={cn("max-w-[70%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.sender_type === 'customer' ? "bg-white border border-slate-200 text-slate-800" :
                    msg.sender_type === 'system' ? "bg-slate-200 text-slate-700 text-xs italic" :
                    "bg-sky-500 text-white"
                  )}>{msg.body}</div>
                  <span className="text-[10px] text-slate-400 mt-1 px-1">{new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-slate-200 bg-white shrink-0">
              <div className="flex items-end space-x-2">
                <button className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0"><Paperclip className="w-5 h-5" /></button>
                <div className="flex-1 bg-slate-100 rounded-xl border border-transparent focus-within:border-sky-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-sky-400 transition-all">
                  <textarea
                    rows={2} value={draft} onChange={e => setDraft(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Type an SMS message..."
                    className="w-full bg-transparent border-none p-3 text-sm outline-none resize-none"
                  />
                </div>
                <button onClick={handleSend} className="p-3 bg-sky-500 hover:bg-sky-600 text-white rounded-xl transition-colors shrink-0 shadow-sm"><Send className="w-5 h-5" /></button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-slate-400">
            <p>Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}

// âââ Main Communication Page âââ
export default function Communication() {
  const [activeTab, setActiveTab] = useState<Tab>('team');

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      {/* Header + Tabs */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Communication</h1>
          <p className="text-sm text-slate-500 mt-1">Team messaging and customer conversations</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex bg-slate-100 p-1 rounded-xl mb-4 shrink-0 w-fit">
        <button
          onClick={() => setActiveTab('team')}
          className={cn(
            "px-5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
            activeTab === 'team' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <Users className="w-4 h-4" /> Team Chat
        </button>
        <button
          onClick={() => setActiveTab('customers')}
          className={cn(
            "px-5 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2",
            activeTab === 'customers' ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"
          )}
        >
          <MessageSquare className="w-4 h-4" /> Customer Messages
        </button>
      </div>

      {/* Panel */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex overflow-hidden">
        {activeTab === 'team' ? <TeamChatPanel /> : <CustomerPanel />}
      </div>
    </div>
  );
}
