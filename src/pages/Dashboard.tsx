import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, Users, Wrench, Package, Plus, BarChart3, ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardStats } from '@/hooks/useDashboard';
import {
  DASHBOARD_PERIOD_LABELS,
  dashboardRangeFor,
  type DashboardCustomRange,
  type DashboardFilterPeriod,
} from '@/lib/dashboardPeriods';
import {
  DASHBOARD_REVENUE_OUTCOME_LABELS,
  DEFAULT_DASHBOARD_REVENUE_FILTERS,
  type DashboardRevenueOutcome,
} from '@/lib/dashboardRevenueFilters';
import QuickCreate from '@/components/QuickCreate';
import UpcomingTasksPanel from '@/components/dashboard/UpcomingTasksPanel';
import { Skeleton, StatsSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/contexts/AuthContext';

const statMeta = [
  { key: 'totalRevenue', title: 'Total Revenue', icon: DollarSign, color: 'text-emerald-400', bg: 'bg-emerald-500/15', format: (v: number) => `$${v.toLocaleString()}`, link: '/deals' },
  { key: 'activeDeals', title: 'Active Deals', icon: Users, color: 'text-brand-400', bg: 'bg-brand-500/15', format: (v: number) => String(v), link: '/deals' },
  { key: 'unscheduledJobs', title: 'Unscheduled Jobs', icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-500/15', format: (v: number) => String(v), link: '/service' },
  // A neutral count, not an alarm — red implied something was wrong at 0 parts
  { key: 'overduePartsCount', title: 'Parts On Order', icon: Package, color: 'text-violet-400', bg: 'bg-violet-500/15', format: (v: number) => String(v), link: '/inventory' },
] as const;

export default function Dashboard() {
  const { profile } = useAuth();
  const [selectedPeriod, setSelectedPeriod] = useState<DashboardFilterPeriod>('month');
  const [appliedPeriod, setAppliedPeriod] = useState<DashboardFilterPeriod>('month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [appliedCustomRange, setAppliedCustomRange] = useState<DashboardCustomRange | null>(null);
  const [revenueFilters, setRevenueFilters] = useState(DEFAULT_DASHBOARD_REVENUE_FILTERS);
  const [showCreate, setShowCreate] = useState(false);
  const {
    stats,
    upcomingTasks,
    taskOwners,
    openDeals,
    revenueData,
    revenueOwners,
    revenueStores,
    isLoading,
    isRevenueLoading,
    loadError,
    revenueLoadError,
    refresh,
  } = useDashboardStats(
    appliedPeriod,
    appliedPeriod === 'custom' ? appliedCustomRange : null,
    revenueFilters,
  );

  const customCandidate = { startDate: customStart, endDate: customEnd };
  const validCustomRange = dashboardRangeFor('custom', customCandidate);
  const customDatesComplete = Boolean(customStart && customEnd);
  const customDateError = customDatesComplete && !validCustomRange
    ? (customStart > customEnd ? 'End date must be on or after start date.' : 'Enter a valid start and end date.')
    : null;
  const appliedPeriodLabel = appliedPeriod === 'custom' && appliedCustomRange
    ? `${DASHBOARD_PERIOD_LABELS.custom}: ${appliedCustomRange.startDate} to ${appliedCustomRange.endDate}`
    : DASHBOARD_PERIOD_LABELS[appliedPeriod];

  const handlePeriodChange = (nextPeriod: DashboardFilterPeriod) => {
    setSelectedPeriod(nextPeriod);
    if (nextPeriod !== 'custom') setAppliedPeriod(nextPeriod);
  };

  const applyCustomDates = () => {
    if (!validCustomRange) return;
    setAppliedCustomRange(customCandidate);
    setAppliedPeriod('custom');
  };

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
      {loadError && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>Some dashboard numbers couldn't load — what's shown may be incomplete. ({loadError})</span>
          <button onClick={refresh} className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1 text-xs font-semibold hover:bg-red-500/15 transition-colors">Retry</button>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-ink-500">Overview</p>
            <h1 className="mt-0.5 text-[22px] sm:text-[26px] leading-tight font-bold text-ink-100 tracking-tight">Manager Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCreate(true)}
              className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"
            >
              <Plus className="w-4 h-4 mr-2" />New
            </button>
          </div>
        </div>

      </div>

      {showCreate && <QuickCreate onClose={() => setShowCreate(false)} />}

      {/* Personal, not monumental: one calm strip with the shop's logo, then straight to the numbers. */}
      <section className="dashboard-welcome overflow-hidden rounded-2xl border border-ink-700 bg-[radial-gradient(circle_at_top_left,_rgba(16,117,184,0.22),_transparent_45%),linear-gradient(135deg,_rgba(15,23,42,0.96),_rgba(15,23,42,0.86))] px-5 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white truncate">
              Welcome back{profile ? `, ${profile.first_name}` : ''}
            </h2>
            <p className="mt-0.5 text-[13px] text-ink-300 truncate">Your dealership pulse, personalized for the team.</p>
          </div>
          <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-xl bg-transparent p-1 sm:h-[72px] sm:w-28">
            <img src="/mchl-duck-dashboard.png" alt="Magic City Home Leisure duck logo" className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statMeta.map((meta) => {
          const value = stats[meta.key];
          return (
            <Link key={meta.key} to={meta.link} className="dashboard-stat-card relative bg-ink-900 rounded-xl border border-ink-700 p-4 sm:p-5 flex items-start justify-between gap-3 hover:border-brand-500/50 hover:bg-ink-850 transition-all group">
              {/* Numbers are doors — Brandon clicks a stat expecting to land on those rows */}
              <ArrowUpRight className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-ink-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500 mb-1.5">{meta.title}</p>
                <h3 className="text-[22px] sm:text-[24px] leading-none font-bold text-ink-100 group-hover:text-brand-500 transition-colors">{meta.format(value)}</h3>
              </div>
              <div className={`p-2.5 rounded-[10px] shrink-0 hidden sm:block ${meta.bg}`}>
                <meta.icon className={`w-5 h-5 ${meta.color}`} />
              </div>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="dashboard-panel lg:col-span-2 bg-ink-900 rounded-xl border border-ink-700 overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-ink-700 bg-ink-850/70 px-6 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <h2 className="text-base font-semibold text-ink-100 whitespace-nowrap">Revenue Overview</h2>
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-500 sm:w-44">
                Date range
                <select
                  aria-label="Dashboard date range"
                  value={selectedPeriod}
                  onChange={(event) => handlePeriodChange(event.target.value as DashboardFilterPeriod)}
                  className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs font-medium normal-case tracking-normal text-ink-100 outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {(Object.keys(DASHBOARD_PERIOD_LABELS) as DashboardFilterPeriod[]).map((period) => (
                    <option key={period} value={period}>{DASHBOARD_PERIOD_LABELS[period]}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3" aria-label="Revenue Overview filters">
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                Outcome
                <select
                  aria-label="Revenue outcome"
                  value={revenueFilters.outcome}
                  onChange={(event) => setRevenueFilters((current) => ({
                    ...current,
                    outcome: event.target.value as DashboardRevenueOutcome,
                  }))}
                  className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs font-medium normal-case tracking-normal text-ink-100 outline-none focus:ring-2 focus:ring-brand-500"
                >
                  {(Object.keys(DASHBOARD_REVENUE_OUTCOME_LABELS) as DashboardRevenueOutcome[]).map((outcome) => (
                    <option key={outcome} value={outcome}>{DASHBOARD_REVENUE_OUTCOME_LABELS[outcome]}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                Assigned owner
                <select
                  aria-label="Revenue assigned owner"
                  value={revenueFilters.assignedTo ?? ''}
                  onChange={(event) => setRevenueFilters((current) => ({
                    ...current,
                    assignedTo: event.target.value || null,
                  }))}
                  className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs font-medium normal-case tracking-normal text-ink-100 outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All Sales Associates</option>
                  {revenueOwners.map((owner) => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                Store
                <select
                  aria-label="Revenue store"
                  value={revenueFilters.locationId ?? ''}
                  onChange={(event) => setRevenueFilters((current) => ({
                    ...current,
                    locationId: event.target.value || null,
                  }))}
                  className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-xs font-medium normal-case tracking-normal text-ink-100 outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="">All Stores</option>
                  {revenueStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </label>
            </div>
            {selectedPeriod === 'custom' && (
              <form
                className="flex flex-col gap-2 rounded-xl border border-ink-700 bg-ink-900 p-3 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  event.preventDefault();
                  applyCustomDates();
                }}
              >
                <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-ink-400">
                  Start date
                  <input
                    aria-label="Custom range start date"
                    type="date"
                    value={customStart}
                    max={customEnd || undefined}
                    onChange={(event) => setCustomStart(event.target.value)}
                    className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-normal text-ink-100 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-ink-400">
                  End date
                  <input
                    aria-label="Custom range end date"
                    type="date"
                    value={customEnd}
                    min={customStart || undefined}
                    onChange={(event) => setCustomEnd(event.target.value)}
                    className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-normal text-ink-100 outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </label>
                <button
                  type="submit"
                  disabled={!validCustomRange}
                  className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply dates
                </button>
                <p className={`text-xs sm:max-w-52 ${customDateError ? 'text-red-400' : 'text-ink-500'}`} aria-live="polite">
                  {customDateError ?? (customDatesComplete
                    ? (appliedPeriod === 'custom' && appliedCustomRange
                      ? `${appliedPeriodLabel}. Dates are inclusive.`
                      : 'Dates are inclusive. Apply to update the chart.')
                    : 'Choose both dates to apply an inclusive range.')}
                </p>
              </form>
            )}
          </div>
          <div className="h-72 p-5">
            {isRevenueLoading ? (
              <Skeleton className="h-full w-full" />
            ) : revenueLoadError ? (
              <div className="flex h-full flex-col items-center justify-center rounded-xl border border-red-500/30 bg-red-500/10 px-6 text-center">
                <p className="text-sm font-medium text-red-300">Revenue couldn't load for these filters.</p>
                <button onClick={refresh} className="mt-3 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-200 hover:bg-red-500/15">Retry</button>
              </div>
            ) : revenueData.every((d) => d.revenue === 0) ? (
              <div className="h-full flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-ink-700 bg-ink-850/50">
                <div className="w-10 h-10 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center mb-3">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <p className="text-sm font-medium text-ink-400">No matching closed deals {DASHBOARD_PERIOD_LABELS[appliedPeriod].toLowerCase()}</p>
                <p className="text-xs text-ink-500 mt-1">Closed deals will chart here when they match these filters</p>
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

        <UpcomingTasksPanel tasks={upcomingTasks} owners={taskOwners} openDeals={openDeals} />
      </div>
    </div>
  );
}
