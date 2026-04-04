import { Search, Phone, Mail, MessageSquare, MoreVertical, Send, Paperclip } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useConversations } from '@/hooks/useConversations';

export default function Communication() {
  const { conversations, activeChat, setActiveChat, messages } = useConversations();

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Communication Hub</h1>
          <p className="text-sm text-slate-500 mt-1">Manage all customer SMS and emails</p>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex overflow-hidden">
        {/* Inbox List */}
        <div className="w-80 border-r border-slate-200 flex flex-col bg-slate-50 shrink-0">
          <div className="p-4 border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search messages..."
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((chat) => (
              <div 
                key={chat.id}
                onClick={() => setActiveChat(chat)}
                className={cn(
                  "p-4 border-b border-slate-100 cursor-pointer hover:bg-slate-100 transition-colors",
                  activeChat.id === chat.id ? "bg-white border-l-4 border-l-cyan-500" : "border-l-4 border-l-transparent"
                )}
              >
                <div className="flex justify-between items-start mb-1">
                  <h3 className={cn("text-sm font-medium", chat.unread > 0 ? "text-slate-900" : "text-slate-700")}>
                    {chat.name}
                  </h3>
                  <span className="text-xs text-slate-500">{chat.time}</span>
                </div>
                <div className="flex justify-between items-center">
                  <p className={cn("text-xs truncate pr-4", chat.unread > 0 ? "text-slate-800 font-medium" : "text-slate-500")}>
                    {chat.lastMessage}
                  </p>
                  {chat.unread > 0 && (
                    <span className="bg-cyan-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                      {chat.unread}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Chat Header */}
          <div className="h-16 border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{activeChat.name}</h2>
              <p className="text-xs text-slate-500 flex items-center">
                <Phone className="w-3 h-3 mr-1" /> (555) 123-4567
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <Mail className="w-5 h-5" />
              </button>
              <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex flex-col", msg.sender === 'customer' ? "items-start" : "items-end")}>
                <div className={cn(
                  "max-w-[70%] rounded-2xl px-4 py-2.5 text-sm",
                  msg.sender === 'customer' ? "bg-white border border-slate-200 text-slate-800" : 
                  msg.sender === 'system' ? "bg-slate-200 text-slate-700 text-xs italic" :
                  "bg-cyan-600 text-white"
                )}>
                  {msg.text}
                </div>
                <span className="text-[10px] text-slate-400 mt-1 px-1">{msg.time}</span>
              </div>
            ))}
          </div>

          {/* Input Area */}
          <div className="p-4 border-t border-slate-200 bg-white shrink-0">
            <div className="flex items-end space-x-2">
              <button className="p-3 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
                <Paperclip className="w-5 h-5" />
              </button>
              <div className="flex-1 bg-slate-100 rounded-xl border border-transparent focus-within:border-cyan-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-cyan-500 transition-all">
                <textarea 
                  rows={2}
                  placeholder="Type an SMS message..."
                  className="w-full bg-transparent border-none p-3 text-sm outline-none resize-none"
                />
              </div>
              <button className="p-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-xl transition-colors shrink-0 shadow-sm">
                <Send className="w-5 h-5" />
              </button>
            </div>
            <div className="flex justify-between items-center mt-2 px-12">
              <span className="text-xs text-slate-400">Press Enter to send</span>
              <button className="text-xs font-medium text-cyan-600 hover:text-cyan-700">Use Template</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
