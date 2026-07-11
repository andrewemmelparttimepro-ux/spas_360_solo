import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Sparkles, ArrowLeft, Hash, User, History, SquarePen, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useTeamChat, type TeamMember } from '@/hooks/useTeamChat';
import { useAuth } from '@/contexts/AuthContext';
import MentionInput from '@/components/MentionInput';
import MentionText from '@/components/MentionText';
import AriAvatar from '@/components/AriAvatar';
import { composeMentionBody, type PickedMention } from '@/lib/mentions';

/**
 * One communication surface. The directory lists everyone you can talk to —
 * Ari sits at the top like any other teammate (he just never sleeps), then
 * the Main channel, recent DMs, and the rest of the team. Ari being an agent
 * is an implementation detail, not a different place to go.
 */

type View = 'directory' | 'chat' | 'ariHistory';
type ActiveChat = 'ari' | 'team';

/** Small-screen detection that tracks rotation/resize (matches Tailwind's sm breakpoint). */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

/**
 * iOS PWA keyboard fix. Fixed-position elements don't shrink when the software
 * keyboard opens — Safari pans the page instead, stranding the composer mid-screen
 * over a dead gap. visualViewport reports the TRUE visible height, so on mobile we
 * drive the sheet's height from it: keyboard opens → sheet shrinks → composer sits
 * directly on the keyboard. window.scrollTo(0,0) cancels Safari's pan.
 */
function useVisualViewportHeight(active: boolean) {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    if (!active) { setHeight(null); return; }
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setHeight(Math.round(vv.height));
      window.scrollTo(0, 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [active]);
  return height;
}

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [activeChat, setActiveChat] = useState<ActiveChat>('ari');
  const [draft, setDraft] = useState('');
  const pickedRef = useRef<PickedMention[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { user, profile } = useAuth();

  const agent = useAgentChat();
  const team = useTeamChat();

  const isMobile = useIsMobile();
  const vvHeight = useVisualViewportHeight(isOpen && isMobile);

  const isAri = activeChat === 'ari';
  const currentMessages = isAri ? agent.messages : team.messages;
  const currentSending = isAri ? agent.isSending : team.isSending;

  // Auto-scroll on new messages AND when the keyboard resizes the sheet —
  // otherwise the last message hides behind the keyboard.
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentMessages, vvHeight]);

  // Lock the page behind the full-screen sheet on mobile (no scroll bleed-through).
  useEffect(() => {
    if (!(isOpen && isMobile)) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [isOpen, isMobile]);

  // Continuity: opening straight into Ari resumes the latest conversation
  useEffect(() => {
    if (isOpen && isAri && view === 'chat' && !agent.activeThreadId && agent.threads.length > 0) {
      agent.setActiveThreadId(agent.threads[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, agent.threads.length]);

  // ─── Send ──────────────────────────────────────────────
  const handleSend = async () => {
    if (!draft.trim() || currentSending) return;
    // Picked @mentions become tokens in the stored body
    const msg = composeMentionBody(draft, pickedRef.current);
    pickedRef.current = [];
    setDraft('');
    if (isAri) {
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

  // ─── Directory actions ─────────────────────────────────
  const openAri = () => { setActiveChat('ari'); setView('chat'); };
  const openMain = async () => { setActiveChat('team'); await team.openMain(); setView('chat'); };
  const openDM = async (member: TeamMember) => { setActiveChat('team'); await team.openDM(member.id); setView('chat'); };
  const openTeamThread = (threadId: string) => { setActiveChat('team'); team.setActiveThreadId(threadId); setView('chat'); };

  // ─── Header content ────────────────────────────────────
  const headerTitle = () => {
    if (view === 'directory') return 'Messages';
    if (view === 'ariHistory') return 'Conversations with Ari';
    if (isAri) return 'Ari';
    if (team.activeThread?.is_main) return 'Main';
    if (team.activeThread?.dm_partner) return `${team.activeThread.dm_partner.first_name} ${team.activeThread.dm_partner.last_name}`;
    return team.activeThread?.title || 'Team Chat';
  };
  const headerSub = () => {
    if (view === 'directory') return 'Ari + your team';
    if (view === 'ariHistory') return `${agent.threads.length} saved`;
    if (isAri) return currentSending ? 'Working the phones…' : 'Sales Assistant · Always on';
    if (team.activeThread?.is_main) return `${team.members.length} members`;
    return 'Direct message';
  };

  const otherMembers = team.members.filter(m => m.id !== user?.id);
  const fmtWhen = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : null;

  return (
    <>
      {/* Floating bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'fixed right-6 z-50 w-14 h-14 rounded-full shadow-lg items-center justify-center transition-all duration-300 hover:scale-110',
          'bottom-[max(1.5rem,env(safe-area-inset-bottom))]',
          // On mobile the open sheet covers the screen — the header X closes it instead.
          isOpen ? 'hidden sm:flex bg-ink-800 text-white' : 'flex bg-brand-500 text-white shadow-brand-500/30 hover:shadow-brand-500/50'
        )}
        aria-label={isOpen ? 'Close messages' : 'Open messages'}
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        {!isOpen && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-ink-900 flex items-center justify-center">
            <Sparkles className="w-2.5 h-2.5 text-white" />
          </span>
        )}
      </button>

      {/* Panel */}
      {isOpen && (
        <div
          className={cn(
            'fixed z-50 bg-ink-900 flex flex-col overflow-hidden',
            // Mobile: full-screen sheet, height driven by the visual viewport (keyboard-aware)
            'inset-x-0 top-0 h-[100dvh] rounded-none',
            // Desktop: the classic popover
            'sm:inset-x-auto sm:top-auto sm:bottom-24 sm:right-6 sm:w-[400px] sm:h-[560px] sm:rounded-2xl sm:shadow-2xl sm:border sm:border-ink-700'
          )}
          style={isMobile && vvHeight ? { height: vvHeight } : undefined}
        >
          {/* Header */}
          <div className="bg-ink-900 text-white px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:pt-3 flex items-center justify-between border-b border-ink-700 shrink-0">
            <div className="flex items-center min-w-0">
              {view !== 'directory' && (
                <button
                  onClick={() => setView(view === 'ariHistory' ? 'chat' : 'directory')}
                  className="p-1 mr-2 hover:bg-ink-800 rounded"
                  aria-label="Back"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              {((view === 'chat' && isAri) || view === 'ariHistory') ? (
                <AriAvatar size="sm" className="mr-3" />
              ) : (
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center mr-3 shrink-0',
                  view === 'chat' && !team.activeThread?.is_main ? 'bg-emerald-500/15' : 'bg-brand-500/20'
                )}>
                  {view === 'directory' ? <MessageSquare className="w-4 h-4 text-brand-400" />
                    : team.activeThread?.is_main ? <Hash className="w-4 h-4 text-brand-400" />
                    : <User className="w-4 h-4 text-emerald-300" />}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="font-semibold text-sm leading-tight truncate">{headerTitle()}</h3>
                <p className="text-[10px] text-ink-500 truncate">{headerSub()}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {view === 'chat' && isAri && (
                <>
                  <button
                    onClick={() => setView('ariHistory')}
                    className="p-1.5 text-ink-400 hover:text-brand-300 hover:bg-ink-800 rounded-lg transition-colors"
                    title="Conversation history" aria-label="Conversation history"
                  >
                    <History className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => { agent.startNewChat(); setDraft(''); }}
                    className="p-1.5 text-ink-400 hover:text-brand-300 hover:bg-ink-800 rounded-lg transition-colors"
                    title="New conversation" aria-label="New conversation"
                  >
                    <SquarePen className="w-4 h-4" />
                  </button>
                </>
              )}
              {/* Mobile: the sheet covers the FAB, so the X lives here */}
              <button
                onClick={() => setIsOpen(false)}
                className="sm:hidden p-1.5 -mr-1 text-ink-400 hover:text-ink-100 hover:bg-ink-800 rounded-lg transition-colors"
                aria-label="Close messages"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* ═══ DIRECTORY — everyone you can talk to ═══ */}
          {view === 'directory' && (
            <div className="flex-1 overflow-y-auto">
              {/* Ari — first name on the roster */}
              <button
                onClick={openAri}
                className="w-full text-left p-4 border-b border-ink-800 hover:bg-brand-500/10 transition-colors flex items-center"
              >
                <AriAvatar size="md" showStatus className="mr-3" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-100">Ari</p>
                  <p className="text-[11px] text-ink-400 truncate">
                    Sales Assistant · {agent.threads[0]?.last_message_at ? fmtWhen(agent.threads[0].last_message_at) : 'Always on'}
                  </p>
                </div>
                <Sparkles className="w-3.5 h-3.5 text-brand-400/70 shrink-0" />
              </button>

              {/* Main channel */}
              <button
                onClick={openMain}
                className="w-full text-left p-4 border-b border-ink-800 hover:bg-ink-800 transition-colors flex items-center"
              >
                <div className="w-9 h-9 bg-brand-500/15 rounded-lg flex items-center justify-center mr-3 shrink-0">
                  <Hash className="w-5 h-5 text-brand-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-ink-100">Main</p>
                  <p className="text-[11px] text-ink-400">Message everyone on the team</p>
                </div>
              </button>

              {/* Recent DM threads */}
              {team.threads.filter(t => !t.is_main).length > 0 && (
                <>
                  <div className="px-4 pt-4 pb-1">
                    <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Recent conversations</p>
                  </div>
                  {team.threads.filter(t => !t.is_main).map(t => (
                    <button
                      key={t.id}
                      onClick={() => openTeamThread(t.id)}
                      className="w-full text-left px-4 py-3 border-b border-ink-800 hover:bg-ink-800 transition-colors flex items-center"
                    >
                      <div className="w-8 h-8 bg-ink-700 rounded-full flex items-center justify-center mr-3 shrink-0 text-xs font-bold text-ink-300">
                        {t.dm_partner ? t.dm_partner.first_name[0] : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink-300 truncate">
                          {t.dm_partner ? `${t.dm_partner.first_name} ${t.dm_partner.last_name}` : t.title}
                        </p>
                        <p className="text-[10px] text-ink-500">{fmtWhen(t.last_message_at) ?? 'No messages yet'}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Team roster */}
              <div className="px-4 pt-4 pb-1">
                <p className="text-[10px] font-semibold text-ink-500 uppercase tracking-wider">Team members</p>
              </div>
              {otherMembers.length === 0 ? (
                <p className="text-sm text-ink-500 text-center py-6">No other team members found</p>
              ) : otherMembers.map(m => (
                <button
                  key={m.id}
                  onClick={() => openDM(m)}
                  className="w-full text-left px-4 py-3 border-b border-ink-800 hover:bg-ink-800 transition-colors flex items-center"
                >
                  <div className="w-8 h-8 bg-emerald-500/15 rounded-full flex items-center justify-center mr-3 shrink-0 text-xs font-bold text-emerald-300">
                    {m.first_name[0]}{m.last_name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink-300">{m.first_name} {m.last_name}</p>
                    <p className="text-[10px] text-ink-500 capitalize">{m.role.replace('_', ' ')}</p>
                  </div>
                  <span className="text-[10px] text-brand-400 font-medium">Message</span>
                </button>
              ))}
            </div>
          )}

          {/* ═══ ARI — CONVERSATION HISTORY ═══ */}
          {view === 'ariHistory' && (
            <div className="flex-1 overflow-y-auto bg-ink-950/50">
              <button
                onClick={() => { agent.startNewChat(); setView('chat'); }}
                className="w-full flex items-center gap-2.5 px-4 py-3 border-b border-ink-800 text-brand-300 hover:bg-brand-500/10 transition-colors text-sm font-semibold"
              >
                <SquarePen className="w-4 h-4" /> New conversation
              </button>
              {agent.threads.length === 0 ? (
                <p className="text-xs text-ink-500 text-center py-10">No conversations yet</p>
              ) : agent.threads.map(t => (
                <div
                  key={t.id}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 border-b border-ink-800/60 hover:bg-ink-800 transition-colors group',
                    t.id === agent.activeThreadId && 'bg-brand-500/10'
                  )}
                >
                  <button
                    onClick={() => { agent.setActiveThreadId(t.id); setView('chat'); }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className={cn('block text-sm truncate', t.id === agent.activeThreadId ? 'text-brand-300 font-semibold' : 'text-ink-100 font-medium')}>
                      {t.title || 'Untitled'}
                    </span>
                    <span className="block text-[11px] text-ink-500">{fmtWhen(t.last_message_at) ?? 'Empty'}</span>
                  </button>
                  {confirmDeleteId === t.id ? (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] font-semibold text-ink-400 hover:text-ink-200 px-1.5 py-1">Keep</button>
                      <button
                        onClick={async () => { await agent.deleteThread(t.id); setConfirmDeleteId(null); }}
                        className="text-[11px] font-bold text-white bg-red-600 hover:bg-red-700 px-2 py-1 rounded-md"
                      >
                        Delete
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(t.id)}
                      className="p-1.5 text-ink-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                      aria-label={`Delete conversation ${t.title ?? ''}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ═══ CHAT — Ari ═══ */}
          {view === 'chat' && isAri && (
            <>
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 bg-ink-950/50">
                {agent.messages.length === 0 && !agent.isSending && (
                  <div className="text-center py-12">
                    <AriAvatar size="lg" className="mx-auto mb-3" />
                    <p className="text-sm font-medium text-ink-300">What are we closing today?</p>
                    <div className="mt-4 space-y-2">
                      {['Look up a customer', "What's in the pipeline?", "Today's schedule", 'Draft a follow-up email'].map(s => (
                        <button
                          key={s}
                          onClick={() => setDraft(s)}
                          className="block mx-auto px-3 py-1.5 text-xs bg-ink-900 border border-ink-700 rounded-full text-ink-300 hover:bg-brand-500/10 hover:border-brand-500/30 hover:text-brand-300 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {agent.messages.filter(m => m.role !== 'tool' && m.role !== 'system').map(msg => (
                  <div key={msg.id} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                    <div className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-brand-500 text-white rounded-br-md'
                        : 'bg-ink-900 border border-ink-700 text-ink-100 rounded-bl-md shadow-sm'
                    )}>
                      {msg.role === 'assistant' && msg.tool_calls && (
                        <div className="flex items-center text-[10px] text-brand-400 mb-1.5 font-medium">
                          <Sparkles className="w-3 h-3 mr-1" /> Using tools...
                        </div>
                      )}
                      <div className="whitespace-pre-wrap"><MentionText body={msg.content} /></div>
                    </div>
                  </div>
                ))}

                {agent.isSending && (
                  <div className="flex justify-start">
                    <div className="bg-ink-900 border border-ink-700 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex space-x-1.5">
                        <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 border-t border-ink-700 bg-ink-900 shrink-0">
                <div className="flex items-end space-x-2">
                  <MentionInput
                    value={draft}
                    onValueChange={setDraft}
                    picked={pickedRef}
                    onSubmit={handleSend}
                    allowAri={false}
                    autoSize
                    autoFocus={!isMobile}
                    placeholder="Ask Ari… (@ mentions a customer)"
                    className="w-full px-3 py-2 bg-ink-950 border-none rounded-xl text-base sm:text-sm outline-none resize-none focus:bg-ink-800 focus:ring-2 focus:ring-brand-500 transition-all"
                    disabled={agent.isSending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || agent.isSending}
                    className="p-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ═══ CHAT — Team (Main or DM) ═══ */}
          {view === 'chat' && !isAri && (
            <>
              <div className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-3 bg-ink-950/50">
                {team.messages.length === 0 && (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-brand-500/15 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      {team.activeThread?.is_main
                        ? <Hash className="w-6 h-6 text-brand-400" />
                        : <User className="w-6 h-6 text-brand-400" />}
                    </div>
                    <p className="text-sm font-medium text-ink-300">
                      {team.activeThread?.is_main
                        ? 'This is the Main channel. Messages go to the whole team.'
                        : `Start a conversation with ${team.activeThread?.dm_partner?.first_name || 'your teammate'}`}
                    </p>
                  </div>
                )}

                {team.messages.map(msg => {
                  const isMe = msg.sender_id === user?.id;
                  const isAriMsg = msg.role === 'assistant';
                  return (
                    <div key={msg.id} className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
                      <div className="max-w-[85%]">
                        {!isMe && (isAriMsg ? (
                          <p className="flex items-center gap-1 text-[10px] font-semibold text-brand-400 mb-0.5 ml-1">
                            <AriAvatar size="xs" />Ari
                          </p>
                        ) : msg.sender_name && (
                          <p className="text-[10px] font-semibold text-ink-400 mb-0.5 ml-1">{msg.sender_name}</p>
                        ))}
                        <div className={cn(
                          'rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                          isMe
                            ? 'bg-brand-500 text-white rounded-br-md'
                            : isAriMsg
                              ? 'bg-brand-500/10 border border-brand-500/30 text-ink-100 rounded-bl-md shadow-sm'
                              : 'bg-ink-900 border border-ink-700 text-ink-100 rounded-bl-md shadow-sm'
                        )}>
                          <div className="whitespace-pre-wrap"><MentionText body={msg.content} /></div>
                        </div>
                        <p className={cn('text-[9px] text-ink-500 mt-0.5', isMe ? 'text-right mr-1' : 'ml-1')}>
                          {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {team.ariThinking && (
                  <div className="flex justify-start">
                    <div className="bg-brand-500/10 border border-brand-500/30 rounded-2xl rounded-bl-md px-4 py-3 shadow-sm">
                      <div className="flex items-center gap-2">
                        <AriAvatar size="xs" />
                        <div className="flex space-x-1.5">
                          <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <div className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3 border-t border-ink-700 bg-ink-900 shrink-0">
                <div className="flex items-end space-x-2">
                  <MentionInput
                    value={draft}
                    onValueChange={setDraft}
                    picked={pickedRef}
                    onSubmit={handleSend}
                    autoSize
                    autoFocus={!isMobile}
                    placeholder={team.activeThread?.is_main ? 'Message the team… @ to mention' : `Message ${team.activeThread?.dm_partner?.first_name || 'teammate'}… @ to mention`}
                    className="w-full px-3 py-2 bg-ink-950 border-none rounded-xl text-base sm:text-sm outline-none resize-none focus:bg-ink-800 focus:ring-2 focus:ring-brand-500 transition-all"
                    disabled={team.isSending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || team.isSending}
                    className="p-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
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
