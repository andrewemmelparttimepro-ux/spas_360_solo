import { useState, useEffect, useCallback } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths, isWithinInterval, parseISO, differenceInDays } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { DashboardPeriod } from '@/hooks/useDashboard';

const WON_STAGE = 'Closed - Won';

function rangeFor(period: DashboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  if (period === 'week') return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  if (period === 'month') return { start: startOfMonth(now), end: endOfMonth(now) };
  const lm = subMonths(now, 1);
  return { start: startOfMonth(lm), end: endOfMonth(lm) };
}

export interface ReportsData {
  isLoading: boolean;
  revenueByLocation: { name: string; revenue: number }[];
  pipelineByStage: { stage: string; count: number; value: number }[];
  jobsByStatus: { status: string; count: number }[];
  inventoryByStatus: { status: string; count: number; value: number }[];
  inventoryAging: { bucket: string; count: number }[];
  totals: { closedRevenue: number; pipelineValue: number; openJobs: number; inventoryValue: number };
}

const num = (v: unknown) => Number(v) || 0;
const rec = (v: unknown) => v as Record<string, unknown>;

export function useReports(period: DashboardPeriod = 'month'): ReportsData {
  const { profile } = useAuth();
  const [data, setData] = useState<ReportsData>({
    isLoading: true,
    revenueByLocation: [], pipelineByStage: [], jobsByStatus: [],
    inventoryByStatus: [], inventoryAging: [],
    totals: { closedRevenue: 0, pipelineValue: 0, openJobs: 0, inventoryValue: 0 },
  });

  const fetchReports = useCallback(async () => {
    if (!profile?.org_id) return;
    const range = rangeFor(period);

    const [dealsRes, jobsRes, invRes] = await Promise.all([
      supabase.from('deals').select('amount, updated_at, location_id, locations:location_id(name), pipeline_stages!inner(name)').eq('org_id', profile.org_id),
      supabase.from('jobs').select('status').eq('org_id', profile.org_id),
      supabase.from('inventory_items').select('status, cost, msrp, sale_price, date_received').eq('org_id', profile.org_id),
    ]);

    const deals = dealsRes.data ?? [];
    const jobs = jobsRes.data ?? [];
    const inv = invRes.data ?? [];

    const stageName = (d: unknown) => (rec(d).pipeline_stages as { name: string } | null)?.name ?? 'Unknown';
    const locName = (d: unknown) => (rec(d).locations as { name: string } | null)?.name ?? 'Unassigned';

    // 1. Revenue by location — closed-won deals realized within the period
    const revLoc: Record<string, number> = {};
    let closedRevenue = 0;
    for (const d of deals) {
      if (stageName(d) !== WON_STAGE) continue;
      const at = parseISO(rec(d).updated_at as string);
      if (!isWithinInterval(at, range)) continue;
      const amt = num(rec(d).amount);
      revLoc[locName(d)] = (revLoc[locName(d)] ?? 0) + amt;
      closedRevenue += amt;
    }
    const revenueByLocation = Object.entries(revLoc).map(([name, revenue]) => ({ name, revenue }));

    // 2. Pipeline by stage — count + open value across all current deals
    const stageMap: Record<string, { count: number; value: number }> = {};
    let pipelineValue = 0;
    for (const d of deals) {
      const name = stageName(d);
      if (!stageMap[name]) stageMap[name] = { count: 0, value: 0 };
      stageMap[name].count++;
      const amt = num(rec(d).amount);
      stageMap[name].value += amt;
      if (name !== WON_STAGE && name !== 'Closed - Lost') pipelineValue += amt;
    }
    const pipelineByStage = Object.entries(stageMap).map(([stage, v]) => ({ stage, ...v }));

    // 3. Service jobs by status
    const jobMap: Record<string, number> = {};
    let openJobs = 0;
    for (const j of jobs) {
      const s = (rec(j).status as string) ?? 'Unknown';
      jobMap[s] = (jobMap[s] ?? 0) + 1;
      if (s !== 'Completed' && s !== 'Cancelled') openJobs++;
    }
    const jobsByStatus = Object.entries(jobMap).map(([status, count]) => ({ status, count }));

    // 4. Inventory by status (count + value) and aging of in-stock units
    const invMap: Record<string, { count: number; value: number }> = {};
    let inventoryValue = 0;
    const aging = { '0–30 days': 0, '31–90 days': 0, '90+ days': 0 };
    const now = new Date();
    for (const i of inv) {
      const s = (rec(i).status as string) ?? 'Unknown';
      const val = num(rec(i).sale_price) || num(rec(i).msrp) || num(rec(i).cost);
      if (!invMap[s]) invMap[s] = { count: 0, value: 0 };
      invMap[s].count++;
      invMap[s].value += val;
      if (s === 'In Stock') {
        inventoryValue += val;
        const received = rec(i).date_received as string | null;
        const age = received ? differenceInDays(now, parseISO(received)) : 0;
        if (age <= 30) aging['0–30 days']++;
        else if (age <= 90) aging['31–90 days']++;
        else aging['90+ days']++;
      }
    }
    const inventoryByStatus = Object.entries(invMap).map(([status, v]) => ({ status, ...v }));
    const inventoryAging = Object.entries(aging).map(([bucket, count]) => ({ bucket, count }));

    setData({
      isLoading: false,
      revenueByLocation, pipelineByStage, jobsByStatus, inventoryByStatus, inventoryAging,
      totals: { closedRevenue, pipelineValue, openJobs, inventoryValue },
    });
  }, [profile?.org_id, period]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  return data;
}
