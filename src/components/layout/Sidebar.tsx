import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, Wrench, Package, MessageSquare, Settings, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { name: 'Sales CRM', path: '/crm', icon: Users },
  { name: 'Service & Jobs', path: '/service', icon: Wrench },
  { name: 'Inventory', path: '/inventory', icon: Package },
  { name: 'Communication', path: '/communication', icon: MessageSquare },
];

export default function Sidebar() {
  return (
    <div className="w-64 bg-slate-900 text-slate-300 flex flex-col border-r border-slate-800">
      <div className="h-16 flex items-center px-6 border-b border-slate-800 bg-slate-950">
        <Droplets className="w-6 h-6 text-cyan-400 mr-3" />
        <span className="text-xl font-bold text-white tracking-tight">SPAS 360</span>
      </div>
      
      <div className="flex-1 py-6 px-4 space-y-1 overflow-y-auto">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-2">
          Main Menu
        </div>
        {navItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.path}
            className={({ isActive }) =>
              cn(
                'flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-cyan-900/40 text-cyan-400'
                  : 'hover:bg-slate-800 hover:text-white'
              )
            }
          >
            <item.icon className="w-5 h-5 mr-3 flex-shrink-0" />
            {item.name}
          </NavLink>
        ))}
      </div>

      <div className="p-4 border-t border-slate-800">
        <button className="flex items-center px-3 py-2.5 w-full rounded-lg text-sm font-medium hover:bg-slate-800 hover:text-white transition-colors">
          <Settings className="w-5 h-5 mr-3 flex-shrink-0" />
          Settings
        </button>
      </div>
    </div>
  );
}
