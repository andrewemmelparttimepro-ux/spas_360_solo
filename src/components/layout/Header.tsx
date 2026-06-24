import { Bell, Search, MapPin, UserCircle, LogOut, ChevronDown, CheckCheck, Menu } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';

export default function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const { profile, locations, activeLocationId, setActiveLocation, signOut } = useAuth();
  const { items: notifications, unreadCount, markRead, markAllRead } = useNotifications();
  const navigate = useNavigate();
  const [locOpen, setLocOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const locRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const activeLoc = locations.find(l => l.id === activeLocationId);
  const locationLabel = activeLoc ? activeLoc.name + ' Store' : 'All Locations';

  const roleLabels: Record<string, string> = {
    owner_manager: 'Manager',
    service_manager: 'Service Manager',
    salesperson: 'Salesperson',
    technician: 'Technician',
  };

  // Close dropdowns on click outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (locRef.current && !locRef.current.contains(e.target as Node)) setLocOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 sm:px-6 shrink-0">
      <div className="flex items-center flex-1 min-w-0">
        <button
          onClick={onMenuClick}
          className="p-2 mr-1 -ml-1 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="relative w-full max-w-md hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search customers, jobs, inventory..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-200 transition-all outline-none"
          />
        </div>
      </div>

      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Location Selector */}
        <div className="relative" ref={locRef}>
          <button
            onClick={() => setLocOpen(!locOpen)}
            className="flex items-center text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-full transition-colors"
          >
            <MapPin className="w-4 h-4 mr-2 text-slate-400" />
            {locationLabel}
            <ChevronDown className="w-3 h-3 ml-1.5 text-slate-400" />
          </button>
          {locOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
              <button
                onClick={() => { setActiveLocation(null); setLocOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${!activeLocationId ? 'text-sky-500 font-medium' : 'text-slate-700'}`}
              >
                All Locations
              </button>
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => { setActiveLocation(loc.id); setLocOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${activeLocationId === loc.id ? 'text-sky-500 font-medium' : 'text-slate-700'}`}
                >
                  {loc.name} Store
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(o => !o)}
            className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-100"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-500 rounded-full border-2 border-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-lg border border-slate-200 z-50 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900">Notifications</p>
                {unreadCount > 0 && (
                  <button onClick={() => markAllRead()} className="text-xs font-medium text-sky-600 hover:text-sky-700 flex items-center gap-1">
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-8">You're all caught up</p>
                ) : notifications.map(n => (
                  <button
                    key={n.id}
                    onClick={() => { markRead(n.id); setNotifOpen(false); if (n.link) navigate(n.link); }}
                    className={`w-full text-left px-4 py-3 border-b border-slate-50 hover:bg-slate-50 transition-colors flex gap-3 ${n.read ? '' : 'bg-sky-50/40'}`}
                  >
                    <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.read ? 'bg-transparent' : 'bg-sky-500'}`} />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-slate-900 truncate">{n.title}</span>
                      {n.body && <span className="block text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</span>}
                      <span className="block text-[11px] text-slate-400 mt-1">
                        {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Menu */}
        <div className="relative" ref={userRef}>
          <button
            onClick={() => setUserOpen(!userOpen)}
            className="flex items-center space-x-3 pl-4 border-l border-slate-200 hover:bg-slate-50 rounded-lg pr-2 py-1 transition-colors"
          >
            <div className="text-right hidden md:block">
              <div className="text-sm font-medium text-slate-900">
                {profile ? `${profile.first_name} ${profile.last_name}` : 'Loading...'}
              </div>
              <div className="text-xs text-slate-500">
                {profile ? roleLabels[profile.role] ?? profile.role : ''}
              </div>
            </div>
            <UserCircle className="w-8 h-8 text-slate-400" />
          </button>
          {userOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-50">
              <div className="px-4 py-2 border-b border-slate-100">
                <p className="text-sm font-medium text-slate-900">{profile?.email}</p>
                <p className="text-xs text-slate-500">{profile ? roleLabels[profile.role] : ''}</p>
              </div>
              <button
                onClick={() => { signOut(); setUserOpen(false); }}
                className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
