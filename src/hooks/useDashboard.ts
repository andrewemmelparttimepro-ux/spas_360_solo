import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

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
}

interface RevenuePoint {
  name: string;
  revenue: number;
}

export function useDashboardStats() {
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
      supabase.from('deals').select('amount, stage_id, pipeline_stages!inner(name)').eq('org_id', profile.org_id),
      supabase.from('jobs').select('id, status, scheduled_at').eq('org_id', profile.org_id),
      supabase.from('parts').select('id, status, expected_arrival').in('status', ['Ordered', 'Backordered']),
      supabase.from('tasks').select('id, title, status, due_at, deal_id').eq('assigned_to', profile.id).in('status', ['Pending', 'Overdue']).order('due_at').limit(10),
    ]);

    const deals = dealsRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const parts = partsRes.data ?? [];
    const tasks = tasksRes.data ?? [];

    // Compute stats
    const closedDeals = deals.filter((d: Record<string, unknown>) => {
      const stage = d.pipeline_stages as { name: string } | null;
      return stage?.name === 'Closed - Won';
    });
    const totalRevenue = closedDeals.reduce((sum: number, d: Record<string, unknown>) => sum + (Number(d.amount) || 0), 0);
    const activeDeals = deals.filter((d: Record<string, unknown>) => {
      const stage = d.pipeline_stages as { name: string } | null;
      return stage?.name !== 'Closed - Won' && stage?.name !== 'Closed - Lost';
    }).length;
    const unscheduledJobs = jobs.filter((j: Record<string, unknown>) =>
      !j.scheduled_at && j.status !== 'Completed' && j.status !== 'Cancelled'
    ).length;

    const now = new Date();
    const overdueParts = parts.filter((p: Record<string, unknown>) =>
      p.expected_arrival && new Date(p.expected_arrival as string) < now
    ).length;

    setStats({
      totalRevenue,
      activeDeals,
      unscheduledJobs,
      overduePartsCount: overdueParts,
    });

    // Build action items from overdue tasks
    const actionItems: ActionItem[] = tasks.map((t: Record<string, unknown>) => ({
      id: t.id as string,
      title: t.title as string,
      desc: t.deal_id ? 'Follow-up task' : 'General task',
      time: t.due_at ? formatRelativeTime(new Date(t.due_at as string)) : '',
      type: 'task' as const,
    }));
    setActions(actionItems);

    // Revenue data (simulated weekly for now — will improve with real invoice data)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    setRevenueData(days.map(name => ({
      name,
      revenue: Math.floor(Math.random() * 3000) + 1000,
    })));

    setIsLoading(false);
  }, [profile]);

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
