import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Wrench, Package, MessageSquare, Settings, Contact, BarChart3, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Contacts', path: '/contacts', icon: Contact },
  { name: 'Sales CRM', path: '/crm', icon: Users },
  { name: 'Service & Jobs', path: '/service', icon: Wrench },
  { name: 'Inventory', path: '/inventory', icon: Package },
  { name: 'Communication', path: '/communication', icon: MessageSquare },
  { name: 'Reports', path: '/reports', icon: BarChart3 },
];

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    isActive ? 'bg-sky-500/15 text-sky-400' : 'hover:bg-slate-800 hover:text-white'
  );

export default function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div onClick={onClose} className="fixed inset-0 bg-slate-950/60 z-40 lg:hidden" aria-hidden="true" />
      )}

      <aside
        className={cn(
          'w-64 bg-slate-950 text-slate-300 flex flex-col border-r border-slate-800',
          'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out',
          'lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-16 flex items-center px-4 border-b border-slate-800">
          <img src="/logo.png" alt="SPAS 360" className="h-9 mr-3 object-contain" />
          <span className="text-lg font-bold text-white tracking-tight">SPAS <span className="text-sky-400">360</span></span>
          <button onClick={onClose} className="ml-auto p-1 text-slate-400 hover:text-white lg:hidden" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">
            Main Menu
          </div>
          {navItems.map((item) => (
            <NavLink key={item.name} to={item.path} onClick={onClose} className={linkClass}>
              <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
              {item.name}
            </NavLink>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 space-y-3">
          <NavLink to="/settings" onClick={onClose} className={linkClass}>
            <Settings className="w-5 h-5 mr-3 flex-shrink-0" />
            Settings
          </NavLink>
          <p className="text-center text-[11px] text-slate-600">Powered by <span className="text-slate-400 font-medium">NDAI</span></p>
        </div>
      </aside>
    </>
  );
}
