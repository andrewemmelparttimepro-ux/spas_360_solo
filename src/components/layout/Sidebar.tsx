import { NavLink } from 'react-router-dom';
import { Settings, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PRIMARY_NAV_SECTIONS, SECONDARY_NAV_ITEMS, NAV_TONE, type NavTone } from './Header';

const linkClass = (tone: NavTone) => ({ isActive }: { isActive: boolean }) => {
  const t = NAV_TONE[tone ?? 'neutral'];
  return cn(
    'flex items-center px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors',
    isActive ? t.active : 'text-ink-400 hover:bg-ink-800 hover:text-ink-100'
  );
};

/**
 * The nav drawer — every screen size. On phones it's the whole navigation;
 * on desktop it's where the back-office destinations (Inbox, Citadel,
 * Reports, Settings) live so the top bar stays five calm pills.
 */
export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div>
      {/* Overlay */}
      {open && (
        <div onClick={onClose} className="fixed inset-0 bg-black/60 z-40" aria-hidden="true" />
      )}

      <aside
        // inert: the off-screen drawer must not be tab-reachable
        inert={!open}
        className={cn(
          'w-64 bg-ink-900 text-ink-300 flex flex-col border-r border-ink-700',
          'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-14 flex items-center px-4 border-b border-ink-700">
          <img src="/logo-mark.png" alt="SPAS 360" className="h-7 mr-2.5 object-contain" />
          <span className="text-[15px] font-bold text-ink-100 tracking-tight">SPAS <span className="text-brand-400">360</span></span>
          <button onClick={onClose} className="ml-auto p-1 text-ink-500 hover:text-ink-100" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 py-4 px-3 space-y-5 overflow-y-auto">
          {/* The floor: what the top bar shows on desktop */}
          <div>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">
              The Floor
            </div>
            <div className="space-y-1">
              {PRIMARY_NAV_SECTIONS.map((section) =>
                section.items.map((item) => (
                  <NavLink key={item.path} to={item.path} onClick={onClose} className={linkClass(section.tone)}>
                    <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                    {item.name}
                  </NavLink>
                ))
              )}
            </div>
          </div>

          {/* The office: everything that isn't an every-hour destination */}
          <div>
            <div className="px-3 mb-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-500">
              The Office
            </div>
            <div className="space-y-1">
              {SECONDARY_NAV_ITEMS.map((item) => (
                <NavLink key={item.path} to={item.path} onClick={onClose} className={linkClass(null)}>
                  <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
                  {item.name}
                </NavLink>
              ))}
            </div>
          </div>
        </div>

        <div className="p-3 border-t border-ink-700 space-y-3">
          <NavLink to="/settings" onClick={onClose} className={linkClass(null)}>
            <Settings className="w-5 h-5 mr-3 flex-shrink-0" />
            Settings
          </NavLink>
          <p className="text-center text-[11px] text-ink-500">Powered by <span className="text-ink-300 font-medium">NDAI</span></p>
        </div>
      </aside>
    </div>
  );
}
