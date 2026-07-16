import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, Users, Wrench, AlertCircle, Plus, BarChart3 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardStats, PERIOD_LABELS, type DashboardPeriod } from '@/hooks/useDashboard';
import QuickCreate from '@/components/QuickCreate';
import { Skeleton, StatsSkeleton } from '@/components/ui/Skeleton';

const statMeta = [
  { key: 'totalRevenue', title: 'Total Revenue', icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/15', format: (v: number) => `$${v.toLocaleString()}`, link: '/deals' },
  { key: 'activeDeals', title: 'Active Deals', icon: Users, color: 'text-brand-400', bg: 'bg-brand-500/15', format: (v: number) => String(v), link: '/deals' },
  { key: 'unscheduledJobs', title: 'Unscheduled Jobs', icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/15', format: (v: number) => String(v), link: '/service' },
  { key: 'overduePartsCount', title: 'Parts On Order', icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/15', format: (v: number) => String(v), link: '/inventory' },
] as const;

type ActionType = 'task' | 'part' | 'invoice' | 'lead';

const actionDotColors: Record<ActionType, string> = { task: 'bg-amber-500', part: 'bg-brand-400', invoice: 'bg-emerald-500', lead: 'bg-purple-500' };
const actionLinks: Record<ActionType, string> = { task: '/service', part: '/inventory', invoice: '/deals', lead: '/deals' };

export default function Dashboard() {
  const [period, setPeriod] = useState<DashboardPeriod>('week');
  const [showCreate, setShowCreate] = useState(false);
  const { stats, actions, revenueData, isLoading } = useDashboardStats(period);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-56" />
        <StatsSkeleton />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold text-ink-100 tracking-tight">Manager Dashboard</h1>
        <div className="flex items-center gap-3">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
            className="bg-ink-900 border border-ink-700 text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-brand-500"
          >
            {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((p) => (
              <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
            ))}
          </select>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"
          >
            <Plus className="w-4 h-4 mr-2" />New
          </button>
        </div>
      </div>

      {showCreate && <QuickCreate onClose={() => setShowCreate(false)} />}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statMeta.map((meta) => {
          const value = stats[meta.key];
          return (
            <Link key={meta.key} to={meta.link} className="dashboard-stat-card bg-ink-900 rounded-xl border border-ink-700 p-5 flex items-start justify-between gap-3 hover:border-brand-500/50 hover:bg-ink-850 transition-all group">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5">{meta.title}</p>
                <h3 className="text-[24px] leading-none font-bold text-ink-100 group-hover:text-brand-500 transition-colors">{meta.format(value)}</h3>
              </div>
              <div className={`p-2.5 rounded-[10px] shrink-0 ${meta.bg}`}>
                <meta.icon className={`w-5 h-5 ${meta.color}`} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="dashboard-panel lg:col-span-2 bg-ink-900 rounded-xl border border-ink-700 overflow-hidden">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between px-6 py-4 border-b border-ink-700 bg-ink-850/70">
            <h2 className="text-base font-semibold text-ink-100 whitespace-nowrap">Revenue Overview</h2>
            <span className="text-xs font-medium text-ink-500 whitespace-nowrap">{PERIOD_LABELS[period]} · Closed-Won</span>
          </div>
          <div className="h-72 p-5">
            {revenueData.every((d) => d.revenue === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-ink-700 bg-ink-850/50">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-ink-400">No closed revenue {PERIOD_LABELS[period].toLowerCase()}</p>
                <p className="text-xs text-ink-500 mt-1">Won deals will chart here as they close</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D5DEE8" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7789', fontSize: 12 }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7789', fontSize: 12 }} dx={-10} tickFormatter={(val) => `$${val}`} />
                  <Tooltip cursor={{ fill: '#E9EFF5' }} contentStyle={{ borderRadius: '10px', border: '1px solid #D5DEE8', background: '#FFFFFF', color: '#101827', boxShadow: '0 12px 28px rgba(15,23,42,0.14)' }} />
                  <Bar dataKey="revenue" fill="#1075b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="dashboard-panel bg-ink-900 rounded-xl border border-ink-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-ink-700 bg-ink-850/70">
            <h2 className="text-base font-semibold text-ink-100">Requires Attention</h2>
          </div>
          <div className="space-y-3 p-4">
            {actions.length === 0 ? (
              <p className="text-sm text-ink-500 text-center py-6">All caught up!</p>
            ) : actions.map((action) => (
              <Link key={action.id} to={action.link ?? actionLinks[action.type] ?? '/service'} className="flex items-start p-3 bg-ink-850/70 hover:bg-brand-500/10 rounded-lg transition-colors cursor-pointer border border-ink-700/70 hover:border-brand-500/30 group">
                <div className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${actionDotColors[action.type]}`} />
                <div className="ml-3 flex-1">
                  <p className="text-sm font-medium text-ink-100 group-hover:text-brand-500">{action.title}</p>
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
