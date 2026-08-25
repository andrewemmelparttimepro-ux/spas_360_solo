import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { AlertTriangle, DollarSign, TrendingUp, Wrench, Package } from 'lucide-react';
import { useReports } from '@/hooks/useReports';
import { PERIOD_LABELS, type DashboardPeriod } from '@/hooks/useDashboard';

const money = (v: number) => `$${v.toLocaleString()}`;
const BAR = '#1075b8';
const STATUS_COLORS = ['#1075b8', '#34a0ff', '#6366f1', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444'];

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6 ${className}`}>{children}</div>;
}

export default function Reports() {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const r = useReports(period);

  if (r.isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  }

  const kpis = [
    { title: 'Closed Revenue', value: money(r.totals.closedRevenue), sub: PERIOD_LABELS[period], icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/15' },
    { title: 'Open Pipeline', value: money(r.totals.pipelineValue), sub: 'Active deals', icon: TrendingUp, color: 'text-brand-400', bg: 'bg-brand-500/15' },
    { title: 'Open Jobs', value: String(r.totals.openJobs), sub: 'Not completed', icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/15' },
    {
      title: 'Recorded In-Stock Value',
      value: r.totals.inventoryPricedCount > 0 ? money(r.totals.inventoryValue) : 'Not ready',
      sub: `${r.totals.inventoryPricedCount} of ${r.totals.inventoryTotalCount} units have a value`,
      icon: Package,
      color: 'text-indigo-400',
      bg: 'bg-indigo-500/15',
    },
  ];

  const readinessIssues = [
    r.readiness.contacts.missingContactMethod > 0 && `${r.readiness.contacts.missingContactMethod} contacts have neither a usable phone nor email`,
    (r.readiness.contacts.duplicatePhoneGroups + r.readiness.contacts.duplicateEmailGroups) > 0
      && `${r.readiness.contacts.duplicatePhoneGroups} duplicate phone groups and ${r.readiness.contacts.duplicateEmailGroups} duplicate email groups need review`,
    r.readiness.deals.missingExpectedClose > 0 && `${r.readiness.deals.missingExpectedClose} open deals need an expected close date`,
    r.readiness.deals.missingAmount > 0 && `${r.readiness.deals.missingAmount} open deals have no forecast amount`,
    r.readiness.jobs.unscheduledOpen > 0 && `${r.readiness.jobs.unscheduledOpen} open jobs are not scheduled`,
    r.readiness.tasks.overdueOpen > 0 && `${r.readiness.tasks.overdueOpen} open tasks are overdue`,
    r.readiness.inventory.missingFinancialValue > 0 && `${r.readiness.inventory.missingFinancialValue} inventory items have no cost, MSRP, or sale price`,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {r.loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          Some report data couldn't load — these numbers may be incomplete. ({r.loadError})
        </div>
      )}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-500">The Office</p>
          <h1 className="mt-0.5 text-[22px] sm:text-[26px] leading-tight font-bold text-ink-100 tracking-tight">Reports</h1>
        </div>
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

      {readinessIssues.length > 0 && (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-5 py-4" aria-label="Data readiness">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-amber-200">Data readiness — values below are honest, but coverage is incomplete</h2>
              <p className="mt-1 text-xs text-amber-200/80">Existing records were not guessed or silently changed. New contacts are duplicate-guarded and new deals now require an explicit forecast date.</p>
              {/* amber-200 resolves to a dark, readable brown in the light shell — amber-100/85 did not */}
              <ul className="mt-3 grid gap-1.5 text-xs text-amber-200 sm:grid-cols-2">
                {readinessIssues.map(issue => <li key={issue}>• {issue}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((k) => (
          <Card key={k.title} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5">{k.title}</p>
              <h3 className="text-[22px] leading-none font-bold text-ink-100">{k.value}</h3>
              <p className="text-xs text-ink-500 mt-1.5">{k.sub}</p>
            </div>
            <div className={`p-2.5 rounded-[10px] shrink-0 ${k.bg}`}><k.icon className={`w-5 h-5 ${k.color}`} /></div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by location */}
        <Card>
          <h2 className="text-lg font-semibold text-ink-100 mb-1">Revenue by Location</h2>
          <p className="text-xs text-ink-500 mb-5">Closed-Won · {PERIOD_LABELS[period]}</p>
          <div className="h-64">
            {r.revenueByLocation.length === 0 ? (
              <p className="text-sm text-ink-500 text-center pt-20">No closed revenue in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.revenueByLocation}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D5DEE8" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6B7789', fontSize: 12 }} dy={8} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6B7789', fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                  <Tooltip cursor={{ fill: '#E9EFF5' }} formatter={(v: number) => money(v)} contentStyle={{ borderRadius: 8, border: '1px solid #D5DEE8', background: '#FFFFFF', color: '#101827', boxShadow: '0 12px 28px rgba(15,23,42,0.14)' }} />
                  <Bar dataKey="revenue" fill={BAR} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        {/* Service jobs by status */}
        <Card>
          <h2 className="text-lg font-semibold text-ink-100 mb-1">Service Jobs by Status</h2>
          <p className="text-xs text-ink-500 mb-5">All jobs, current</p>
          <div className="h-64">
            {r.jobsByStatus.length === 0 ? (
              <p className="text-sm text-ink-500 text-center pt-20">No jobs yet</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={r.jobsByStatus} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#D5DEE8" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#6B7789', fontSize: 12 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" width={110} axisLine={false} tickLine={false} tick={{ fill: '#6B7789', fontSize: 12 }} />
                  <Tooltip cursor={{ fill: '#E9EFF5' }} contentStyle={{ borderRadius: 8, border: '1px solid #D5DEE8', background: '#FFFFFF', color: '#101827', boxShadow: '0 12px 28px rgba(15,23,42,0.14)' }} />
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
          <h2 className="text-lg font-semibold text-ink-100 mb-5">Pipeline Conversion by Stage</h2>
          {r.pipelineByStage.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-10">No deals yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-medium text-ink-500 border-b border-ink-800">
                  <th className="pb-2">Stage</th><th className="pb-2 text-right">Deals</th><th className="pb-2 text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {r.pipelineByStage.map((s) => (
                  <tr key={s.stage} className="border-b border-ink-800 last:border-0">
                    <td className="py-2.5 font-medium text-ink-300">{s.stage}</td>
                    <td className="py-2.5 text-right text-ink-300">{s.count}</td>
                    <td className="py-2.5 text-right text-ink-100 font-medium">{money(s.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {/* Inventory status + aging */}
        <Card>
          <h2 className="text-lg font-semibold text-ink-100 mb-5">Inventory by Status</h2>
          {r.inventoryByStatus.length === 0 ? (
            <p className="text-sm text-ink-500 text-center py-10">No inventory yet</p>
          ) : (
            <>
              <table className="w-full text-sm mb-5">
                <thead>
                  <tr className="text-left text-xs font-medium text-ink-500 border-b border-ink-800">
                    <th className="pb-2">Status</th><th className="pb-2 text-right">Units</th><th className="pb-2 text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {r.inventoryByStatus.map((s) => (
                    <tr key={s.status} className="border-b border-ink-800 last:border-0">
                      <td className="py-2 font-medium text-ink-300">{s.status}</td>
                      <td className="py-2 text-right text-ink-300">{s.count}</td>
                      <td className="py-2 text-right text-ink-100 font-medium">
                        {s.pricedCount > 0 ? money(s.value) : '—'}
                        <span className="block text-[10px] font-normal text-ink-500">{s.pricedCount}/{s.count} valued</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs font-medium text-ink-500 mb-2">In-Stock Aging</p>
              <div className="flex gap-2">
                {r.inventoryAging.map((a) => (
                  <div key={a.bucket} className="flex-1 bg-ink-950 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-ink-100">{a.count}</div>
                    <div className="text-[11px] text-ink-400 mt-0.5">{a.bucket}</div>
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
