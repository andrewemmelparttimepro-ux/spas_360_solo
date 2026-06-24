import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { DollarSign, TrendingUp, Wrench, Package } from 'lucide-react';
import { useReports } from '@/hooks/useReports';
import { PERIOD_LABELS, type DashboardPeriod } from '@/hooks/useDashboard';

const money = (v: number) => `$${v.toLocaleString()}`;
const BAR = '#06b6d4';
const STATUS_COLORS = ['#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 ${className}`}>{children}</div>;
}

export default function Reports() {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const r = useReports(period);

  if (r.isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  const kpis = [
    { title: 'Closed Revenue', value: money(r.totals.closedRevenue), sub: PERIOD_LABELS[period], icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { title: 'Open Pipeline', value: money(r.totals.pipelineValue), sub: 'Active deals', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-100' },
    { title: 'Open Jobs', value: String(r.totals.openJobs), sub: 'Not completed', icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-100' },
    { title: 'In-Stock Value', value: money(r.totals.inventoryValue), sub: 'Current inventory', icon: Package, color: 'text-indigo-600', bg: 'bg-indigo-100' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports</h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
          className="bg-white border border-slate-200 text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-sky-400"
        >
          {(Object.keys(PERIOD_LABELS) as DashboardPeriod[]).map((p) => (
            <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
          ))}
        </select>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((k) => (
          <Card key={k.title} className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">{k.title}</p>
              <h3 className="text-2xl font-bold text-slate-900">{k.value}</h3>
              <p className="text-xs text-slate-400 mt-1">{k.sub}</p>
            </div>
            <div className={`p-3 rounded-lg ${k.bg}`}><k.icon className={`w-6 h-6 ${k.color}`} /></div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by location */}
        <Card>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Revenue by Location</h2>
          <p className="text-xs text-slate-400 mb-5">Closed-Won · {PERIOD_LABELS[period]}</p>
          <div className="h-64">
            {r.revenueByLocation.length === 0 ? (
              <p className="text-sm text-slate-400 text-center pt-20">No closed revenue in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.revenueByLocation}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} formatter={(v: number) => money(v)} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="revenue" fill={BAR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Service jobs by status */}
        <Card>
          <h2 className="text-lg font-semibold text-slate-900 mb-1">Service Jobs by Status</h2>
          <p className="text-xs text-slate-400 mb-5">All jobs, current</p>
          <div className="h-64">
            {r.jobsByStatus.length === 0 ? (
              <p className="text-sm text-slate-400 text-center pt-20">No jobs yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.jobsByStatus} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" width={110} axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {r.jobsByStatus.map((_, i) => <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Pipeline by stage */}
        <Card>
          <h2 className="text-lg font-semibold text-slate-900 mb-5">Pipeline Conversion by Stage</h2>
          {r.pipelineByStage.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No deals yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-slate-400 border-b border-slate-100">
                  <th className="pb-2">Stage</th><th className="pb-2 text-right">Deals</th><th className="pb-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {r.pipelineByStage.map((s) => (
                  <tr key={s.stage} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 font-medium text-slate-700">{s.stage}</td>
                    <td className="py-2.5 text-right text-slate-600">{s.count}</td>
                    <td className="py-2.5 text-right text-slate-900 font-medium">{money(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Inventory status + aging */}
        <Card>
          <h2 className="text-lg font-semibold text-slate-900 mb-5">Inventory by Status</h2>
          {r.inventoryByStatus.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No inventory yet</p>
          ) : (
            <>
              <table className="w-full text-sm mb-5">
                <thead>
                  <tr className="text-left text-xs font-medium text-slate-400 border-b border-slate-100">
                    <th className="pb-2">Status</th><th className="pb-2 text-right">Units</th><th className="pb-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {r.inventoryByStatus.map((s) => (
                    <tr key={s.status} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-medium text-slate-700">{s.status}</td>
                      <td className="py-2 text-right text-slate-600">{s.count}</td>
                      <td className="py-2 text-right text-slate-900 font-medium">{money(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs font-medium text-slate-400 mb-2">In-Stock Aging</p>
              <div className="flex gap-2">
                {r.inventoryAging.map((a) => (
                  <div key={a.bucket} className="flex-1 bg-slate-50 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-slate-900">{a.count}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{a.bucket}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
