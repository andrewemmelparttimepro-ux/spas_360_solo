import { useState, useEffect, useCallback } from 'react';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths,
  eachDayOfInterval, eachWeekOfInterval, format, isWithinInterval,
} from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export type DashboardPeriod = 'week' | 'month' | 'lastMonth';

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  week: 'This Week',
  month: 'This Month',
  lastMonth: 'Last Month',
};

interface DashboardStats {
  totalRevenue: number;
  activeDeals: number;
  unscheduledJobs: number;
  overduePartsCount: number;
}

interface ActionItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: 'task' | 'part' | 'invoice' | 'lead';
  link?: string;
}

interface RevenuePoint {
  name: string;
  revenue: number;
}

function rangeFor(period: DashboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  switch (period) {
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'lastMonth': {
      const lm = subMonths(now, 1);
      return { start: startOfMonth(lm), end: endOfMonth(lm) };
    }
  }
}

// The DB aggregates revenue per dealership-local day ({d: 'YYYY-MM-DD', v: dollars});
// this only maps those days into the chart's display buckets.
type DailyRevenue = { d: string; v: number };

/**
 * Week → one bucket per weekday; month/lastMonth → one bucket per calendar week.
 * Revenue realizes on deals.closed_at, aggregated server-side (no row caps).
 */
function bucketRevenue(daily: DailyRevenue[], period: DashboardPeriod, range: { start: Date; end: Date }): RevenuePoint[] {
  const byDay = new Map(daily.map((r) => [r.d, Number(r.v) || 0]));
  if (period === 'week') {
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    return days.map((day) => ({
      name: format(day, 'EEE'),
      revenue: byDay.get(format(day, 'yyyy-MM-dd')) ?? 0,
    }));
  }

  const weeks = eachWeekOfInterval({ start: range.start, end: range.end }, { weekStartsOn: 1 });
  return weeks.map((weekStart, i) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const revenue = daily.reduce((sum, r) => {
      const day = new Date(`${r.d}T00:00:00`); // local midnight — matches the DB's local-day grouping
      return isWithinInterval(day, { start: weekStart, end: weekEnd }) ? sum + (Number(r.v) || 0) : sum;
    }, 0);
    return { name: `Wk ${i + 1}`, revenue };
  });
}

export function useDashboardStats(period: DashboardPeriod = 'week') {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0, activeDeals: 0, unscheduledJobs: 0, overduePartsCount: 0,
  });
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [revenueData, setRevenueData] = useState<RevenuePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    const range = rangeFor(period);

    // Money and counts aggregate in SQL (no 1,000-row cap can understate them);
    // the two list queries below only feed the Requires Attention feed.
    const [summaryRes, partsRes, tasksRes] = await Promise.all([
      supabase.rpc('dashboard_summary', {
        p_start: range.start.toISOString(),
        p_end: range.end.toISOString(),
      }),
      supabase.from('parts').select('id, status, expected_arrival, order_date, part_number, description, job_id').in('status', ['Ordered', 'Backordered']).limit(200),
      supabase.from('tasks').select('id, title, status, due_at, deal_id').eq('assigned_to', profile.id).in('status', ['Pending', 'Overdue']).order('due_at').limit(10),
    ]);

    // Zeros on the money tiles must mean "zero", never "the query failed"
    const firstError = summaryRes.error ?? partsRes.error ?? tasksRes.error;
    if (firstError) console.error('Error loading dashboard:', firstError);
    setLoadError(firstError ? firstError.message : null);

    const summary = (summaryRes.data ?? {}) as {
      total_revenue?: number;
      revenue_daily?: DailyRevenue[];
      active_deals?: number;
      unscheduled_jobs?: number;
      overdue_parts?: number;
    };
    const parts = partsRes.data ?? [];
    const tasks = tasksRes.data ?? [];
    const now = new Date();

    if (!summaryRes.error) {
      setStats({
        totalRevenue: Number(summary.total_revenue) || 0,
        activeDeals: Number(summary.active_deals) || 0,
        unscheduledJobs: Number(summary.unscheduled_jobs) || 0,
        overduePartsCount: Number(summary.overdue_parts) || 0,
      });
    }

    // Action items: overdue/pending tasks + parts sitting too long
    const taskActions: ActionItem[] = tasks.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      title: t.title as string,
      desc: t.deal_id ? 'Follow-up task' : 'General task',
      time: t.due_at ? formatRelativeTime(new Date(t.due_at as string)) : '',
      type: 'task' as const,
    }));

    const STAGNANT_DAYS = 14;
    const partActions: ActionItem[] = parts
      .filter((p: Record<string, unknown>) => {
        const arrival = p.expected_arrival ? new Date(p.expected_arrival as string) : null;
        const ordered = p.order_date ? new Date(p.order_date as string) : null;
        const overdue = arrival !== null && arrival < now;
        const stagnant = !arrival && ordered !== null && (now.getTime() - ordered.getTime()) > STAGNANT_DAYS * 86400000;
        return overdue || stagnant;
      })
      .slice(0, 5)
      .map((p: Record<string, unknown>) => {
        const arrival = p.expected_arrival ? new Date(p.expected_arrival as string) : null;
        const overdue = arrival !== null && arrival < now;
        return {
          id: p.id as string,
          title: `Part ${p.part_number} ${overdue ? 'overdue' : `stagnant ${Math.floor((now.getTime() - new Date(p.order_date as string).getTime()) / 86400000)}d`}${p.status === 'Backordered' ? ' (backordered)' : ''}`,
          desc: (p.description as string) || 'Chase the supplier',
          time: arrival ? formatRelativeTime(arrival) : '',
          type: 'part' as const,
          link: p.job_id ? `/service/${p.job_id}` : '/service',
        };
      });

    setActions([...partActions, ...taskActions].slice(0, 10));

    // Real revenue chart from closed-won deals (server-aggregated per local day)
    if (!summaryRes.error) {
      setRevenueData(bucketRevenue(summary.revenue_daily ?? [], period, range));
    }

    setIsLoading(false);
  }, [profile, period]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, actions, revenueData, isLoading, loadError, refresh: fetchStats };
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 0) {
    // Due in the future — floor on a negative diff would overshoot by an hour
    const hoursAhead = Math.floor(-diff / (1000 * 60 * 60));
    return hoursAhead === 0 ? 'Within the hour' : `In ${hoursAhead}h`;
  }
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours === 0) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
