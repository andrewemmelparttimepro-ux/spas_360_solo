import { useState, useEffect, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  bucketDashboardRevenue,
  dashboardRangeFor,
  type DashboardCustomRange,
  type DashboardDailyRevenue,
  type DashboardFilterPeriod,
  type DashboardRevenuePoint,
} from '@/lib/dashboardPeriods';

export { PERIOD_LABELS, type DashboardPeriod } from '@/lib/dashboardPeriods';

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

export function useDashboardStats(
  period: DashboardFilterPeriod = 'week',
  customRange?: DashboardCustomRange | null,
) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0, activeDeals: 0, unscheduledJobs: 0, overduePartsCount: 0,
  });
  const [actions, setActions] = useState<ActionItem[]>([]);
  const [revenueData, setRevenueData] = useState<DashboardRevenuePoint[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const fetchSequence = useRef(0);

  const fetchStats = useCallback(async () => {
    if (!profile) return;
    const sequence = ++fetchSequence.current;
    setIsLoading(true);

    const range = dashboardRangeFor(period, customRange);
    if (!range) {
      setIsLoading(false);
      return;
    }

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
    if (sequence !== fetchSequence.current) return;

    // Zeros on the money tiles must mean "zero", never "the query failed"
    const firstError = summaryRes.error ?? partsRes.error ?? tasksRes.error;
    if (firstError) console.error('Error loading dashboard:', firstError);
    setLoadError(firstError ? firstError.message : null);

    const summary = (summaryRes.data ?? {}) as {
      total_revenue?: number;
      revenue_daily?: DashboardDailyRevenue[];
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
      setRevenueData(bucketDashboardRevenue(summary.revenue_daily ?? [], period, range));
    }

    setIsLoading(false);
  }, [profile, period, customRange?.startDate, customRange?.endDate]);

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
