import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, Users, Wrench, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardStats, PERIOD_LABELS, type DashboardPeriod } from '@/hooks/useDashboard';

const statMeta = [
  { key: 'totalRevenue', title: 'Total Revenue', icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/15', format: (v: number) => `$${v.toLocaleString()}`, link: '/crm' },
  { key: 'activeDeals', title: 'Active Deals', icon: Users, color: 'text-brand-400', bg: 'bg-brand-500/15', format: (v: number) => String(v), link: '/crm' },
  { key: 'unscheduledJobs', title: 'Unscheduled Jobs', icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/15', format: (v: number) => String(v), link: '/service' },
  { key: 'overduePartsCount', title: 'Parts Overdue', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/15', format: (v: number) => String(v), link: '/inventory' },
] as const;

type ActionType = 'task' | 'part' | 'invoice' | 'lead';

const actionDotColors: Record<ActionType, string> = { task: 'bg-amber-500', part: 'bg-brand-400', invoice: 'bg-emerald-500', lead: 'bg-purple-500' };
const actionLinks: Record<ActionType, string> = { task: '/service', part: '/inventory', invoice: '/crm', lead: '/crm' };

export default function Dashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>('week');
  const { stats, actions, revenueData, isLoading } = useDashboardStats(period);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink-100 tracking-tight">Manager Dashboard</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
          className="bg-ink-900 border border-ink-700 text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500"
        >
          {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((p) => (
            <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statMeta.map((meta) => {
          const value = stats[meta.key];
          return (
            <Link key={meta.key} to={meta.link} className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6 flex items-start justify-between hover:shadow-md hover:border-brand-500/30 transition-all">
              <div>
                <p className="text-sm font-medium text-ink-400 mb-1">{meta.title}</p>
                <h3 className="text-2xl font-bold text-ink-100">{meta.format(value)}</h3>
              </div>
              <div className={`p-3 rounded-lg ${meta.bg}`}>
                <meta.icon className={`w-6 h-6 ${meta.color}`} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-lg font-semibold text-ink-100">Revenue Overview</h2>
            <span className="text-xs font-medium text-ink-500">{PERIOD_LABELS[period]} · Closed-Won</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#2A2A32" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF' }} dx={-10} tickFormatter={(val) => `$${val}`} />
                <Tooltip cursor={{ fill: '#1E1E24' }} contentStyle={{ borderRadius: '8px', border: '1px solid #2A2A32', background: '#16161B', color: '#F0F0F0', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }} />
                <Bar dataKey="revenue" fill="#1075b8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
          <h2 className="text-lg font-semibold text-ink-100 mb-4">Requires Attention</h2>
          <div className="space-y-4">
            {actions.length === 0 ? (
              <p className="text-sm text-ink-500 text-center py-6">All caught up!</p>
            ) : actions.map((action) => (
              <Link key={action.id} to={actionLinks[action.type] ?? '/service'} className="flex items-start p-3 hover:bg-brand-500/10 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-brand-500/20 group">
                <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${actionDotColors[action.type]}`} />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-ink-100 group-hover:text-brand-300">{action.title}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{action.desc}</p>
                </div>
                <span className="text-xs font-medium text-ink-500">{action.time}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
