import { Bell, MapPin, UserCircle, LogOut, ChevronDown, CheckCheck, Menu, Settings, LayoutDashboard, Contact, Users, Wrench, Package, MessageSquare, BarChart3 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';

export const NAV_ITEMS = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Contacts', path: '/contacts', icon: Contact },
  { name: 'CRM', path: '/crm', icon: Users },
  { name: 'Service', path: '/service', icon: Wrench },
  { name: 'Inventory', path: '/inventory', icon: Package },
  { name: 'Comms', path: '/communication', icon: MessageSquare },
  { name: 'Reports', path: '/reports', icon: BarChart3 },
];

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
  const locationLabel = activeLoc ? activeLoc.name : 'All Locations';

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
    <header className="h-14 bg-ink-900 border-b border-ink-700 flex items-center px-3 sm:px-5 gap-3 sm:gap-4 shrink-0 z-40">
      {/* Mobile menu */}
      <button
        onClick={onMenuClick}
        className="p-2 -ml-1 text-ink-400 hover:text-ink-100 rounded-lg hover:bg-ink-800 lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Brand */}
      <NavLink to="/dashboard" className="flex items-center gap-2 shrink-0" aria-label="Go to Dashboard">
        <img src="/logo.png" alt="SPAS 360" className="h-8 w-auto object-contain rounded" />
        <span className="text-[15px] font-bold text-ink-100 tracking-tight hidden md:block">
          SPAS <span className="text-brand-400">360</span>
        </span>
      </NavLink>

      {/* Nav pills (desktop) — OMP style: recessed group, brand-tinted active */}
      <nav className="hidden lg:flex gap-0.5 bg-ink-950 rounded-[10px] p-[3px]">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 px-3.5 py-[7px] rounded-lg text-[13px] font-semibold transition-all',
                isActive
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-ink-500 hover:text-ink-300 hover:bg-ink-800'
              )
            }
          >
            <item.icon className="w-[15px] h-[15px]" />
            {item.name}
          </NavLink>
        ))}
      </nav>

      <div className="flex-1" />

      {/* Location Selector */}
      <div className="relative shrink-0" ref={locRef}>
        <button
          onClick={() => setLocOpen(!locOpen)}
          className="flex items-center text-[13px] font-medium text-ink-300 bg-ink-950 hover:bg-ink-800 border border-ink-700 px-3 py-1.5 rounded-full transition-colors"
        >
          <MapPin className="w-3.5 h-3.5 mr-1.5 text-brand-400" />
          <span className="hidden sm:inline">{locationLabel}</span>
          <ChevronDown className="w-3 h-3 ml-1.5 text-ink-500" />
        </button>
        {locOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 bg-ink-850 rounded-lg shadow-lg border border-ink-700 py-1 z-50">
            <button
              onClick={() => { setActiveLocation(null); setLocOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-ink-800 ${!activeLocationId ? 'text-brand-400 font-medium' : 'text-ink-300'}`}
            >
              All Locations
            </button>
            {locations.map(loc => (
              <button
                key={loc.id}
                onClick={() => { setActiveLocation(loc.id); setLocOpen(false); }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-ink-800 ${activeLocationId === loc.id ? 'text-brand-400 font-medium' : 'text-ink-300'}`}
              >
                {loc.name} Store
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Notifications */}
      <div className="relative shrink-0" ref={notifRef}>
        <button
          onClick={() => setNotifOpen(o => !o)}
          className="relative p-2 text-ink-500 hover:text-ink-300 transition-colors rounded-full hover:bg-ink-800"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-brand-500 rounded-full border-2 border-ink-900">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
        {notifOpen && (
          <div className="absolute right-0 top-full mt-1 w-80 bg-ink-850 rounded-lg shadow-lg border border-ink-700 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-700">
              <p className="text-sm font-semibold text-ink-100">Notifications</p>
              {unreadCount > 0 && (
                <button onClick={() => markAllRead()} className="text-xs font-medium text-brand-400 hover:text-brand-300 flex items-center gap-1">
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-ink-500 text-center py-8">You're all caught up</p>
              ) : notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => { markRead(n.id); setNotifOpen(false); if (n.link) navigate(n.link); }}
                  className={`w-full text-left px-4 py-3 border-b border-ink-800 hover:bg-ink-800 transition-colors flex gap-3 ${n.read ? '' : 'bg-brand-500/10'}`}
                >
                  <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${n.read ? 'bg-transparent' : 'bg-brand-400'}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-ink-100 truncate">{n.title}</span>
                    {n.body && <span className="block text-xs text-ink-400 mt-0.5 line-clamp-2">{n.body}</span>}
                    <span className="block text-[11px] text-ink-500 mt-1">
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
      <div className="relative shrink-0" ref={userRef}>
        <button
          onClick={() => setUserOpen(!userOpen)}
          className="flex items-center gap-2.5 pl-3 border-l border-ink-700 hover:bg-ink-800 rounded-lg pr-2 py-1 transition-colors"
        >
          <div className="text-right hidden md:block">
            <div className="text-[13px] font-medium text-ink-100 leading-tight">
              {profile ? `${profile.first_name} ${profile.last_name}` : 'Loading...'}
            </div>
            <div className="text-[11px] text-ink-500 leading-tight">
              {profile ? roleLabels[profile.role] ?? profile.role : ''}
            </div>
          </div>
          <UserCircle className="w-7 h-7 text-ink-500" />
        </button>
        {userOpen && (
          <div className="absolute right-0 top-full mt-1 w-52 bg-ink-850 rounded-lg shadow-lg border border-ink-700 py-1 z-50">
            <div className="px-4 py-2 border-b border-ink-700">
              <p className="text-sm font-medium text-ink-100 truncate">{profile?.email}</p>
              <p className="text-xs text-ink-400">{profile ? roleLabels[profile.role] : ''}</p>
            </div>
            <button
              onClick={() => { navigate('/settings'); setUserOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-ink-300 hover:bg-ink-800 flex items-center"
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </button>
            <button
              onClick={() => { signOut(); setUserOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 flex items-center"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
