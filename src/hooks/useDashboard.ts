import { useState, useEffect, useCallback } from 'react';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths,
  eachDayOfInterval, eachWeekOfInterval, format, isWithinInterval, parseISO,
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

const WON_STAGE = 'Closed - Won';
const LOST_STAGE = 'Closed - Lost';

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

interface ClosedDeal { amount: number; closedAt: Date }

/**
 * Build the revenue chart from real closed-won deals.
 * Week → one bucket per weekday; month/lastMonth → one bucket per calendar week.
 * `updated_at` is the best-available realization signal (no dedicated closed_at column).
 */
function bucketRevenue(deals: ClosedDeal[], period: DashboardPeriod, range: { start: Date; end: Date }): RevenuePoint[] {
  if (period === 'week') {
    const days = eachDayOfInterval({ start: range.start, end: range.end });
    return days.map((day) => {
      const dayEnd = new Date(day); dayEnd.setHours(23, 59, 59, 999);
      const revenue = deals
        .filter((d) => isWithinInterval(d.closedAt, { start: day, end: dayEnd }))
        .reduce((s, d) => s + d.amount, 0);
      return { name: format(day, 'EEE'), revenue };
    });
  }

  const weeks = eachWeekOfInterval({ start: range.start, end: range.end }, { weekStartsOn: 1 });
  return weeks.map((weekStart, i) => {
    const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
    const revenue = deals
      .filter((d) => isWithinInterval(d.closedAt, { start: weekStart, end: weekEnd }))
      .reduce((s, d) => s + d.amount, 0);
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

  const fetchStats = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    const [dealsRes, jobsRes, partsRes, tasksRes] = await Promise.all([
      supabase.from('deals').select('amount, updated_at, stage_id, pipeline_stages!inner(name)').eq('org_id', profile.org_id),
      supabase.from('jobs').select('id, status, scheduled_at').eq('org_id', profile.org_id),
      supabase.from('parts').select('id, status, expected_arrival, order_date, part_number, description, job_id').in('status', ['Ordered', 'Backordered']),
      supabase.from('tasks').select('id, title, status, due_at, deal_id').eq('assigned_to', profile.id).in('status', ['Pending', 'Overdue']).order('due_at').limit(10),
    ]);

    const deals = dealsRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const parts = partsRes.data ?? [];
    const tasks = tasksRes.data ?? [];

    const stageName = (d: Record<string, unknown>) =>
      (d.pipeline_stages as { name: string } | null)?.name ?? '';

    const range = rangeFor(period);

    // Closed-won deals, with their realization date
    const closedDeals: ClosedDeal[] = deals
      .filter((d) => stageName(d as Record<string, unknown>) === WON_STAGE)
      .map((d) => ({
        amount: Number((d as Record<string, unknown>).amount) || 0,
        closedAt: parseISO((d as Record<string, unknown>).updated_at as string),
      }));

    // Revenue is period-scoped (won deals realized within the selected range)
    const totalRevenue = closedDeals
      .filter((d) => isWithinInterval(d.closedAt, range))
      .reduce((s, d) => s + d.amount, 0);

    // Operational counts are live "right now" snapshots, not period-bound
    const activeDeals = deals.filter((d) => {
      const name = stageName(d as Record<string, unknown>);
      return name !== WON_STAGE && name !== LOST_STAGE;
    }).length;
    const unscheduledJobs = jobs.filter((j: Record<string, unknown>) =>
      !j.scheduled_at && j.status !== 'Completed' && j.status !== 'Cancelled'
    ).length;

    const now = new Date();
    const overdueParts = parts.filter((p: Record<string, unknown>) =>
      p.expected_arrival && new Date(p.expected_arrival as string) < now
    ).length;

    setStats({ totalRevenue, activeDeals, unscheduledJobs, overduePartsCount: overdueParts });

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

    // Real revenue chart from closed-won deals
    setRevenueData(bucketRevenue(closedDeals, period, range));

    setIsLoading(false);
  }, [profile, period]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  return { stats, actions, revenueData, isLoading, refresh: fetchStats };
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 0) return `In ${Math.abs(hours)}h`;
  if (hours === 0) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
