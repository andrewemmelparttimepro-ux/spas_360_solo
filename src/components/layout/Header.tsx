import { Bell, Search, MapPin, UserCircle, LogOut, ChevronDown } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export default function Header() {
  const { profile, locations, activeLocationId, setActiveLocation, signOut } = useAuth();
  const [locOpen, setLocOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const locRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

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
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center flex-1">
        <div className="relative w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search customers, jobs, inventory..."
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-transparent rounded-lg text-sm focus:bg-white focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 transition-all outline-none"
          />
        </div>
      </div>

      <div className="flex items-center space-x-4">
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
                className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${!activeLocationId ? 'text-cyan-600 font-medium' : 'text-slate-700'}`}
              >
                All Locations
              </button>
              {locations.map(loc => (
                <button
                  key={loc.id}
                  onClick={() => { setActiveLocation(loc.id); setLocOpen(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-50 ${activeLocationId === loc.id ? 'text-cyan-600 font-medium' : 'text-slate-700'}`}
                >
                  {loc.name} Store
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Notifications */}
        <button className="relative p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-full hover:bg-slate-100">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>

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
