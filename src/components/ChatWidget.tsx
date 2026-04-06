import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Plus, ArrowLeft, Send, Bot, Users, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAgentChat } from '@/hooks/useAgentChat';
import { useAuth } from '@/contexts/AuthContext';

type View = 'threads' | 'chat';
type Tab = 'agent' | 'team';

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>('chat');
  const [tab, setTab] = useState<Tab>('agent');
  const [draft, setDraft] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { profile } = useAuth();

  const {
    threads,
    activeThread,
    activeThreadId,
    setActiveThreadId,
    messages,
    isSending,
    createThread,
    sendMessage,
    sendTeamMessage,
  } = useAgentChat();

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when opening
  useEffect(() => {
    if (isOpen && view === 'chat') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, view]);

  const handleSend = async () => {
    if (!draft.trim() || isSending) return;
    const msg = draft;
    setDraft('');

    if (!activeThreadId) {
      const id = await createThread(tab);
      if (!id) return;
      // Pass thread ID directly to avoid stale closure
      if (tab === 'agent') await sendMessage(msg, id);
      else await sendTeamMessage(msg, id);
      return;
    }

    if (tab === 'agent' || activeThread?.thread_type === 'agent') {
      await sendMessage(msg);
    } else {
      await sendTeamMessage(msg);
    }
  };

  const handleNewThread = async () => {
    await createThread(tab);
    setView('chat');
  };

  const filteredThreads = threads.filter(t => t.thread_type === tab);

  return (
    <>
      {/* Floating Bubble */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110",
          isOpen
            ? "bg-slate-800 text-white rotate-0"
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
        <div className="fixed bottom-24 right-6 z-50 w-[400px] h-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4">
          {/* Header */}
          <div className="bg-slate-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
            {view === 'threads' ? (
              <>
                <div className="flex items-center">
                  <button onClick={() => setView('chat')} className="p-1 mr-2 hover:bg-slate-700 rounded"><ArrowLeft className="w-4 h-4" /></button>
                  <h3 className="font-semibold text-sm">Conversations</h3>
                </div>
                <button onClick={handleNewThread} className="p-1.5 hover:bg-slate-700 rounded-lg"><Plus className="w-4 h-4" /></button>
              </>
            ) : (
              <>
                <div className="flex items-center">
                  <div className="w-8 h-8 bg-sky-500/20 rounded-lg flex items-center justify-center mr-3">
                    {tab === 'agent' ? <Bot className="w-4 h-4 text-sky-400" /> : <Users className="w-4 h-4 text-sky-400" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm leading-tight">
                      {tab === 'agent' ? 'Sales Assistant' : 'Team Chat'}
                    </h3>
                    <p className="text-[10px] text-slate-400">
                      {tab === 'agent' ? (isSending ? 'Thinking...' : 'Online') : `${profile?.first_name}'s team`}
                    </p>
                  </div>
                </div>
                <button onClick={() => setView('threads')} className="text-xs text-slate-400 hover:text-white px-2 py-1 hover:bg-slate-700 rounded">
                  History
                </button>
              </>
            )}
          </div>

          {/* Tab Switcher */}
          <div className="flex border-b border-slate-200 shrink-0 bg-slate-50">
            <button
              onClick={() => { setTab('agent'); setActiveThreadId(null); }}
              className={cn("flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center",
                tab === 'agent' ? "text-sky-600 border-b-2 border-sky-500 bg-white" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Bot className="w-3.5 h-3.5 mr-1.5" /> AI Assistant
            </button>
            <button
              onClick={() => { setTab('team'); setActiveThreadId(null); }}
              className={cn("flex-1 py-2 text-xs font-semibold transition-colors flex items-center justify-center",
                tab === 'team' ? "text-sky-600 border-b-2 border-sky-500 bg-white" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Users className="w-3.5 h-3.5 mr-1.5" /> Team
            </button>
          </div>

          {/* Thread List View */}
          {view === 'threads' ? (
            <div className="flex-1 overflow-y-auto">
              {filteredThreads.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400">
                  <MessageSquare className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No conversations yet</p>
                  <button onClick={handleNewThread} className="mt-3 text-xs text-sky-600 hover:text-sky-700 font-medium">
                    Start a new one
                  </button>
                </div>
              ) : filteredThreads.map(t => (
                <button
                  key={t.id}
                  onClick={() => { setActiveThreadId(t.id); setView('chat'); }}
                  className={cn("w-full text-left p-4 border-b border-slate-100 hover:bg-slate-50 transition-colors",
                    activeThreadId === t.id && "bg-sky-50 border-l-2 border-l-sky-500"
                  )}
                >
                  <p className="text-sm font-medium text-slate-800 truncate">{t.title || 'New conversation'}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {t.last_message_at ? new Date(t.last_message_at).toLocaleString() : 'Just created'}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                {messages.length === 0 && !isSending && (
                  <div className="text-center py-12">
                    <div className="w-12 h-12 bg-sky-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      {tab === 'agent' ? <Bot className="w-6 h-6 text-sky-500" /> : <Users className="w-6 h-6 text-sky-500" />}
                    </div>
                    <p className="text-sm font-medium text-slate-700">
                      {tab === 'agent' ? "How can I help you sell today?" : "Chat with your team"}
                    </p>
                    {tab === 'agent' && (
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
                    )}
                  </div>
                )}

                {messages.filter(m => m.role !== 'tool' && m.role !== 'system').map(msg => (
                  <div
                    key={msg.id}
                    className={cn("flex", msg.role === 'user' ? "justify-end" : "justify-start")}
                  >
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

                {isSending && (
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

              {/* Input */}
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
                    placeholder={tab === 'agent' ? 'Ask your sales assistant...' : 'Message your team...'}
                    className="flex-1 px-3 py-2 bg-slate-100 border-none rounded-xl text-sm outline-none resize-none focus:bg-white focus:ring-2 focus:ring-sky-500 transition-all"
                    disabled={isSending}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!draft.trim() || isSending}
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
