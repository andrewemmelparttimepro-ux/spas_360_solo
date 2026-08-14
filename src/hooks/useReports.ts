import { useState, useEffect, useCallback } from 'react';
import { startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { DashboardPeriod } from '@/hooks/useDashboard';

function rangeFor(period: DashboardPeriod): { start: Date; end: Date } {
  const now = new Date();
  if (period === 'week') return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
  if (period === 'month') return { start: startOfMonth(now), end: endOfMonth(now) };
  const lm = subMonths(now, 1);
  return { start: startOfMonth(lm), end: endOfMonth(lm) };
}

export interface ReportsData {
  isLoading: boolean;
  loadError: string | null;
  revenueByLocation: { name: string; revenue: number }[];
  pipelineByStage: { stage: string; count: number; value: number }[];
  jobsByStatus: { status: string; count: number }[];
  inventoryByStatus: { status: string; count: number; pricedCount: number; value: number }[];
  inventoryAging: { bucket: string; count: number }[];
  totals: {
    closedRevenue: number;
    pipelineValue: number;
    openJobs: number;
    inventoryValue: number;
    inventoryTotalCount: number;
    inventoryPricedCount: number;
  };
  readiness: {
    contacts: { total: number; missingContactMethod: number; duplicatePhoneGroups: number; duplicateEmailGroups: number };
    deals: { open: number; missingExpectedClose: number; missingAmount: number };
    jobs: { open: number; unscheduledOpen: number };
    tasks: { overdueOpen: number };
    inventory: { total: number; priced: number; missingFinancialValue: number; inStockTotal: number; inStockPriced: number };
  };
}

// Shape of the reports_summary() jsonb — every number aggregated in SQL so the
// report can never be silently understated by the 1,000-row API cap.
interface ReportsSummary {
  revenue_by_location?: { name: string; revenue: number }[];
  pipeline_by_stage?: { stage: string; count: number; value: number }[];
  jobs_by_status?: { status: string; count: number }[];
  inventory_by_status?: { status: string; count: number; priced_count?: number; value: number }[];
  inventory_aging?: { bucket: string; count: number }[];
  totals?: { closed_revenue: number; pipeline_value: number; open_jobs: number; inventory_value: number; inventory_total_count?: number; inventory_priced_count?: number };
  data_readiness?: {
    contacts?: { total?: number; missing_contact_method?: number; duplicate_phone_groups?: number; duplicate_email_groups?: number };
    deals?: { open?: number; missing_expected_close?: number; missing_amount?: number };
    jobs?: { open?: number; unscheduled_open?: number };
    tasks?: { overdue_open?: number };
    inventory?: { total?: number; priced?: number; missing_financial_value?: number; in_stock_total?: number; in_stock_priced?: number };
  };
}

const num = (v: unknown) => Number(v) || 0;

export function useReports(period: DashboardPeriod = 'month'): ReportsData {
  const { profile } = useAuth();
  const [data, setData] = useState<ReportsData>({
    isLoading: true,
    loadError: null,
    revenueByLocation: [], pipelineByStage: [], jobsByStatus: [],
    inventoryByStatus: [], inventoryAging: [],
    totals: { closedRevenue: 0, pipelineValue: 0, openJobs: 0, inventoryValue: 0, inventoryTotalCount: 0, inventoryPricedCount: 0 },
    readiness: {
      contacts: { total: 0, missingContactMethod: 0, duplicatePhoneGroups: 0, duplicateEmailGroups: 0 },
      deals: { open: 0, missingExpectedClose: 0, missingAmount: 0 },
      jobs: { open: 0, unscheduledOpen: 0 },
      tasks: { overdueOpen: 0 },
      inventory: { total: 0, priced: 0, missingFinancialValue: 0, inStockTotal: 0, inStockPriced: 0 },
    },
  });

  const fetchReports = useCallback(async () => {
    if (!profile?.org_id) return;
    const range = rangeFor(period);

    const { data: summary, error } = await supabase.rpc('reports_summary', {
      p_start: range.start.toISOString(),
      p_end: range.end.toISOString(),
    });

    // A report full of zeros must mean "no data", never "a query quietly failed"
    if (error) {
      console.error('Error loading reports:', error);
      setData(prev => ({ ...prev, isLoading: false, loadError: error.message }));
      return;
    }

    const s = (summary ?? {}) as ReportsSummary;
    setData({
      isLoading: false,
      loadError: null,
      revenueByLocation: (s.revenue_by_location ?? []).map(r => ({ name: r.name, revenue: num(r.revenue) })),
      pipelineByStage: (s.pipeline_by_stage ?? []).map(r => ({ stage: r.stage, count: num(r.count), value: num(r.value) })),
      jobsByStatus: (s.jobs_by_status ?? []).map(r => ({ status: r.status, count: num(r.count) })),
      inventoryByStatus: (s.inventory_by_status ?? []).map(r => ({ status: r.status, count: num(r.count), pricedCount: num(r.priced_count), value: num(r.value) })),
      inventoryAging: (s.inventory_aging ?? []).map(r => ({ bucket: r.bucket, count: num(r.count) })),
      totals: {
        closedRevenue: num(s.totals?.closed_revenue),
        pipelineValue: num(s.totals?.pipeline_value),
        openJobs: num(s.totals?.open_jobs),
        inventoryValue: num(s.totals?.inventory_value),
        inventoryTotalCount: num(s.totals?.inventory_total_count),
        inventoryPricedCount: num(s.totals?.inventory_priced_count),
      },
      readiness: {
        contacts: {
          total: num(s.data_readiness?.contacts?.total),
          missingContactMethod: num(s.data_readiness?.contacts?.missing_contact_method),
          duplicatePhoneGroups: num(s.data_readiness?.contacts?.duplicate_phone_groups),
          duplicateEmailGroups: num(s.data_readiness?.contacts?.duplicate_email_groups),
        },
        deals: {
          open: num(s.data_readiness?.deals?.open),
          missingExpectedClose: num(s.data_readiness?.deals?.missing_expected_close),
          missingAmount: num(s.data_readiness?.deals?.missing_amount),
        },
        jobs: {
          open: num(s.data_readiness?.jobs?.open),
          unscheduledOpen: num(s.data_readiness?.jobs?.unscheduled_open),
        },
        tasks: { overdueOpen: num(s.data_readiness?.tasks?.overdue_open) },
        inventory: {
          total: num(s.data_readiness?.inventory?.total),
          priced: num(s.data_readiness?.inventory?.priced),
          missingFinancialValue: num(s.data_readiness?.inventory?.missing_financial_value),
          inStockTotal: num(s.data_readiness?.inventory?.in_stock_total),
          inStockPriced: num(s.data_readiness?.inventory?.in_stock_priced),
        },
      },
    });
  }, [profile?.org_id, period]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  return data;
}
