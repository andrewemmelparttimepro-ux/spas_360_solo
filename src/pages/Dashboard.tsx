import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, ArrowDownRight, DollarSign, Users, Wrench, AlertCircle } from 'lucide-react';
import { useDashboardStats } from '@/hooks/useDashboard';

const statMeta = [
  { key: 'totalRevenue', title: 'Total Revenue', icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-100', format: (v: number) => `$${v.toLocaleString()}` },
  { key: 'activeDeals', title: 'Active Deals', icon: Users, color: 'text-blue-600', bg: 'bg-blue-100', format: (v: number) => String(v) },
  { key: 'unscheduledJobs', title: 'Unscheduled Jobs', icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-100', format: (v: number) => String(v) },
  { key: 'overduePartsCount', title: 'Parts Overdue', icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100', format: (v: number) => String(v) },
] as const;

type ActionType = 'task' | 'part' | 'invoice' | 'lead';

const actionDotColors: Record<ActionType, string> = { task: 'bg-amber-500', part: 'bg-blue-500', invoice: 'bg-emerald-500', lead: 'bg-purple-500' };

export default function Dashboard() {
  const { stats, actions, revenueData, isLoading } = useDashboardStats();

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Manager Dashboard</h1>
        <select className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500">
          <option>This Week</option><option>This Month</option><option>Last Month</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statMeta.map((meta) => {
          const value = stats[meta.key];
          return (
            <div key={meta.key} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{meta.title}</p>
                <h3 className="text-2xl font-bold text-slate-900">{meta.format(value)}</h3>
              </div>
              <div className={`p-3 rounded-lg ${meta.bg}`}>
                <meta.icon className={`w-6 h-6 ${meta.color}`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">Revenue Overview</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b' }} dx={-10} tickFormatter={(val) => `$${val}`} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="revenue" fill="#06b6d4" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Requires Attention</h2>
          <div className="space-y-4">
            {actions.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">All caught up! 🎉</p>
            ) : actions.map((action) => (
              <div key={action.id} className="flex items-start p-3 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-100">
                <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${actionDotColors[action.type]}`} />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-slate-900">{action.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{action.desc}</p>
                </div>
                <span className="text-xs font-medium text-slate-400">{action.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
