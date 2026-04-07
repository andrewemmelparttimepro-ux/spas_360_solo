import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, Users, Sparkles, ArrowLeft, Hash, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useTeamChat, type TeamMember } from '@/hooks/useTeamChat';
import { useAuth } from '@/contexts/AuthContext';

type Tab = 'agent' | 'team';
type TeamView = 'directory' | 'chat';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('agent');
  const [teamView, setTeamView] = useState<TeamView>('directory');
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user, profile } = useAuth();

  // AI chat
  const agent = useAgentChat();

  // Team chat
  const team = useTeamChat();

  // Determine current context
  const isAgent = tab === 'agent';
  const currentMessages = isAgent ? agent.messages : team.messages;
  const currentSending = isAgent ? agent.isSending : team.isSending;

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages]);

  // Focus input when entering chat view
  useEffect(() => {
    if (isOpen && (isAgent || teamView === 'chat')) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isAgent, teamView]);

  // ─── Send handler ──────────────────────────────────────
  const handleSend = async () => {
    if (!draft.trim() || currentSending) return;
    const msg = draft;
    setDraft('');

    if (isAgent) {
      if (!agent.activeThreadId) {
        const id = await agent.createThread('agent');
        if (!id) return;
        setTimeout(() => agent.sendMessage(msg), 200);
        return;
      }
      await agent.sendMessage(msg);
    } else {
      if (!team.activeThreadId) return;
      await team.sendMessage(msg);
    }
  };

  // ─── Team: open Main channel ───────────────────────────
  const handleOpenMain = async () => {
    await team.openMain();
    setTeamView('chat');
  };

  // ─── Team: open DM with member ─────────────────────────
  const handleOpenDM = async (member: TeamMember) => {
    await team.openDM(member.id);
    setTeamView('chat');
  };

  // ─── Team: open existing thread ────────────────────────
  const handleOpenThread = (threadId: string) => {
    team.setActiveThreadId(threadId);
    setTeamView('chat');
  };

  // ─── Switch tabs ───────────────────────────────────────
  const handleTabSwitch = (newTab: Tab) => {
    setTab(newTab);
    setDraft('');
    if (newTab === 'team') {
      setTeamView('directory');
    }
  };

  // ─── Chat header label ─────────────────────────────────
  const chatHeaderLabel = () => {
    if (isAgent) return 'Sales Assistant';
    if (!team.activeThread) return 'Team Chat';
    if (team.activeThread.is_main) return 'Main';
    if (team.activeThread.dm_partner) return team.activeThread.dm_partner.first_name + ' ' + team.activeThread.dm_partner.last_name;
    return team.activeThread.title || 'Team Chat';
  };

  const chatHeaderSub = () => {
    if (isAgent) return currentSending ? 'Thinking...' : 'Online';
    if (!team.activeThread) return '';
    if (team.activeThread.is_main) return `${team.members.length} members`;
    return 'Direct message';
  };

  // ─── Other team members (exclude self) ─────────────────
  const otherMembers = team.members.filter(m => m.id !== user?.id);

  return (
    <>
      {/* Floating Bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110",
          isOpen
            ? "bg-slate-800 text-white"
            : "bg-sky-500 text-white shadow-sky-500/30 hover:shadow-sky-500/50"
        )}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center">
            <Sparkles className="w-2.5 h-2.5 text-white" />
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] h-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
            {!isAgent && teamView === 'chat' ? (
              <>
                <div className="flex items-center">
                  <button onClick={() => setTeamView('directory')} className="p-1 mr-2 hover:bg-slate-700 rounded">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="w-8 h-8 bg-sky-500/20 rounded-lg flex items-center justify-center mr-3">
                    {team.activeThread?.is_main
                      ? <Hash className="w-4 h-4 text-sky-400" />
                      : <User className="w-4 h-4 text-sky-400" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm leading-tight">{chatHeaderLabel()}</h3>
                    <p className="text-[10px] text-slate-400">{chatHeaderSub()}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center">
                <div className="w-8 h-8 bg-sky-500/20 rounded-lg flex items-center justify-center mr-3">
                  {isAgent ? <Bot className="w-4 h-4 text-sky-400" /> : <Users className="w-4 h-4 text-sky-400" />}
                </div>
                <div>
                  <h3 className="font-semibold text-sm leading-tight">
                    {isAgent ? 'Sales Assistant' : 'Team Chat'}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    {isAgent ? (currentSending ? 'Thinking...' : 'Online') : `${profile?.first_name}'s team`}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Tab Switcher */}
          <div className="flex border-b border-slate-200 shrink-0 bg-slate-50">
            <button
              onClick={() => handleTabSwitch('agent')}
              className={cn("flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center",
                tab === 'agent' ? "text-sky-600 border-b-2 border-sky-500 bg-white" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Bot className="w-3.5 h-3.5 mr-1.5" /> AI Assistant
            </button>
            <button
              onClick={() => handleTabSwitch('team')}
              className={cn("flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center",
                tab === 'team' ? "text-sky-600 border-b-2 border-sky-500 bg-white" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Users className="w-3.5 h-3.5 mr-1.5" /> Team
            </button>
          </div>

          {/* ═══ AGENT TAB ═══ */}
          {isAgent && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {agent.messages.length === 0 && !agent.isSending && (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-sky-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <Bot className="w-6 h-6 text-sky-500" />
                    </div>
                    <p className="text-sm font-medium text-slate-700">How can I help you sell today?</p>
                    <div className="mt-4 space-y-2">
                      {['Look up a customer', "What's in the pipeline?", "Today's schedule", 'Draft a follow-up text'].map(s => (
                        <button
                          key={s}
                          onClick={() => { setDraft(s); inputRef.current?.focus(); }}
                          className="block mx-auto px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-full text-slate-600 hover:bg-sky-50 hover:border-sky-200 hover:text-sky-700 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {agent.messages.filter(m => m.role !== 'tool' && m.role !== 'system').map(msg => (
                  <div key={msg.id} className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                      msg.role === 'user'
                        ? "bg-sky-500 text-white rounded-br-md"
                        : "bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm"
                    )}>
                      {msg.role === 'assistant' && msg.tool_calls && (
                        <div className="flex items-center text-[10px] text-sky-500 mb-1.5 font-medium">
                          <Sparkles className="w-3 h-3 mr-1" /> Using tools...
                        </div>
                      )}
                      <div className="whitespace-pre-wrap">{msg.content}</div>
                    </div>
                  </div>
                ))}

                {agent.isSending && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex space-x-1.5">
                        <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Agent Input */}
              <div className="p-3 border-t border-slate-200 bg-white shrink-0">
                <div className="flex items-end space-x-2">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    onChange={e => {
                      setDraft(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                    }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder="Ask your sales assistant..."
                    className="flex-1 px-3 py-2 bg-slate-100 border-none rounded-xl text-sm outline-none resize-none focus:bg-white focus:ring-2 focus:ring-sky-500 transition-all"
                    disabled={agent.isSending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || agent.isSending}
                    className="p-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ═══ TEAM TAB - DIRECTORY VIEW ═══ */}
          {!isAgent && teamView === 'directory' && (
            <div className="flex-1 overflow-y-auto">
              {/* Main Channel */}
              <button
                onClick={handleOpenMain}
                className="w-full text-left p-4 border-b border-slate-100 hover:bg-sky-50 transition-colors flex items-center"
              >
                <div className="w-9 h-9 bg-sky-100 rounded-lg flex items-center justify-center mr-3 shrink-0">
                  <Hash className="w-5 h-5 text-sky-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800">Main</p>
                  <p className="text-[11px] text-slate-500">Message everyone on the team</p>
                </div>
              </button>

              {/* Recent DM threads */}
              {team.threads.filter(t => !t.is_main).length > 0 && (
                <>
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Recent conversations</p>
                  </div>
                  {team.threads.filter(t => !t.is_main).map(t => (
                    <button
                      key={t.id}
                      onClick={() => handleOpenThread(t.id)}
                      className="w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-center"
                    >
                      <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center mr-3 shrink-0 text-xs font-bold text-slate-600">
                        {t.dm_partner ? t.dm_partner.first_name[0] : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">
                          {t.dm_partner ? `${t.dm_partner.first_name} ${t.dm_partner.last_name}` : t.title}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : 'No messages yet'}
                        </p>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Team Directory */}
              <div className="px-4 pt-4 pb-1">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Team members</p>
              </div>
              {otherMembers.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No other team members found</p>
              ) : otherMembers.map(m => (
                <button
                  key={m.id}
                  onClick={() => handleOpenDM(m)}
                  className="w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex items-center"
                >
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center mr-3 shrink-0 text-xs font-bold text-emerald-700">
                    {m.first_name[0]}{m.last_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700">{m.first_name} {m.last_name}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{m.role.replace('_', ' ')}</p>
                  </div>
                  <span className="text-[10px] text-sky-500 font-medium">Message</span>
                </button>
              ))}
            </div>
          )}

          {/* ═══ TEAM TAB - CHAT VIEW ═══ */}
          {!isAgent && teamView === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {team.messages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-sky-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      {team.activeThread?.is_main
                        ? <Hash className="w-6 h-6 text-sky-500" />
                        : <User className="w-6 h-6 text-sky-500" />}
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      {team.activeThread?.is_main
                        ? 'This is the Main channel. Messages go to the whole team.'
                        : `Start a conversation with ${team.activeThread?.dm_partner?.first_name || 'your teammate'}`}
                    </p>
                  </div>
                )}

                {team.messages.map(msg => {
                  const isMe = msg.sender_id === user?.id;
                  return (
                    <div key={msg.id} className={cn("flex", isMe ? "justify-end" : "justify-start")}>
                      <div className="max-w-[85%]">
                        {/* Sender name for others' messages */}
                        {!isMe && msg.sender_name && (
                          <p className="text-[10px] font-semibold text-slate-500 mb-0.5 ml-1">{msg.sender_name}</p>
                        )}
                        <div className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                          isMe
                            ? "bg-sky-500 text-white rounded-br-md"
                            : "bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm"
                        )}>
                          <div className="whitespace-pre-wrap">{msg.content}</div>
                        </div>
                        <p className={cn("text-[9px] text-slate-400 mt-0.5", isMe ? "text-right mr-1" : "ml-1")}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}

                <div ref={messagesEndRef} />
              </div>

              {/* Team Input */}
              <div className="p-3 border-t border-slate-200 bg-white shrink-0">
                <div className="flex items-end space-x-2">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={draft}
                    onChange={e => {
                      setDraft(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                    }}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                    placeholder={team.activeThread?.is_main ? 'Message the team...' : `Message ${team.activeThread?.dm_partner?.first_name || 'teammate'}...`}
                    className="flex-1 px-3 py-2 bg-slate-100 border-none rounded-xl text-sm outline-none resize-none focus:bg-white focus:ring-2 focus:ring-sky-500 transition-all"
                    disabled={team.isSending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || team.isSending}
                    className="p-2.5 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
