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
import {
  taskOwnerName,
  upcomingTaskLink,
  type TaskOwnerOption,
  type UpcomingTaskItem,
} from '@/lib/upcomingTasks';

export { PERIOD_LABELS, type DashboardPeriod } from '@/lib/dashboardPeriods';

interface DashboardStats {
  totalRevenue: number;
  activeDeals: number;
  unscheduledJobs: number;
  overduePartsCount: number;
}

export function useDashboardStats(
  period: DashboardFilterPeriod = 'week',
  customRange?: DashboardCustomRange | null,
) {
  const { profile } = useAuth();
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0, activeDeals: 0, unscheduledJobs: 0, overduePartsCount: 0,
  });
  const [upcomingTasks, setUpcomingTasks] = useState<UpcomingTaskItem[]>([]);
  const [taskOwners, setTaskOwners] = useState<TaskOwnerOption[]>([]);
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

    // Money and counts aggregate in SQL (no 1,000-row cap can understate them).
    // Task rows and owner choices are both explicitly scoped to this dealership.
    const [summaryRes, tasksRes, ownersRes] = await Promise.all([
      supabase.rpc('dashboard_summary', {
        p_start: range.start.toISOString(),
        p_end: range.end.toISOString(),
      }),
      supabase
        .from('tasks')
        .select('id, title, status, due_at, deal_id, contact_id, job_id, assigned_to, assigned:assigned_to(id, first_name, last_name)')
        .eq('org_id', profile.org_id)
        .in('status', ['Pending', 'In Progress', 'Overdue'])
        .order('due_at', { ascending: true }),
      supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .eq('org_id', profile.org_id)
        .in('role', ['owner_manager', 'service_manager', 'salesperson'])
        .order('first_name', { ascending: true })
        .order('last_name', { ascending: true }),
    ]);
    if (sequence !== fetchSequence.current) return;

    // Zeros on the money tiles must mean "zero", never "the query failed"
    const firstError = summaryRes.error ?? tasksRes.error ?? ownersRes.error;
    if (firstError) console.error('Error loading dashboard:', firstError);
    setLoadError(firstError ? firstError.message : null);

    const summary = (summaryRes.data ?? {}) as {
      total_revenue?: number;
      revenue_daily?: DashboardDailyRevenue[];
      active_deals?: number;
      unscheduled_jobs?: number;
      overdue_parts?: number;
    };
    if (!summaryRes.error) {
      setStats({
        totalRevenue: Number(summary.total_revenue) || 0,
        activeDeals: Number(summary.active_deals) || 0,
        unscheduledJobs: Number(summary.unscheduled_jobs) || 0,
        overduePartsCount: Number(summary.overdue_parts) || 0,
      });
    }

    if (!ownersRes.error) {
      setTaskOwners((ownersRes.data ?? []) as TaskOwnerOption[]);
    }

    if (!tasksRes.error) {
      setUpcomingTasks((tasksRes.data ?? []).map((row: Record<string, unknown>) => {
        const assignedRelation = Array.isArray(row.assigned) ? row.assigned[0] : row.assigned;
        const assigned = assignedRelation as TaskOwnerOption | null;
        const assignedTo = row.assigned_to as string;
        return {
          id: row.id as string,
          title: row.title as string,
          desc: row.deal_id ? 'Deal follow-up' : row.contact_id ? 'Customer follow-up' : row.job_id ? 'Service task' : 'General task',
          time: row.due_at ? formatRelativeTime(new Date(row.due_at as string)) : '',
          assignedTo,
          assignedName: assigned ? taskOwnerName(assigned) : 'Unassigned owner',
          link: upcomingTaskLink({
            deal_id: (row.deal_id as string | null) ?? null,
            contact_id: (row.contact_id as string | null) ?? null,
            job_id: (row.job_id as string | null) ?? null,
          }),
        };
      }));
    }

    // Real revenue chart from closed-won deals (server-aggregated per local day)
    if (!summaryRes.error) {
      setRevenueData(bucketDashboardRevenue(summary.revenue_daily ?? [], period, range));
    }

    setIsLoading(false);
  }, [profile, period, customRange?.startDate, customRange?.endDate]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, upcomingTasks, taskOwners, revenueData, isLoading, loadError, refresh: fetchStats };
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
