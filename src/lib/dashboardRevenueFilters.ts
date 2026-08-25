import type { DashboardDateRange } from '@/lib/dashboardPeriods';

export type DashboardRevenueOutcome = 'closed_won' | 'all_closed';

export interface DashboardRevenueFilters {
  outcome: DashboardRevenueOutcome;
  assignedTo: string | null;
  locationId: string | null;
}

export interface DashboardRevenueFilterOption {
  id: string;
  name: string;
}

export const DASHBOARD_REVENUE_OUTCOME_LABELS: Record<DashboardRevenueOutcome, string> = {
  closed_won: 'Closed-Won',
  all_closed: 'All Closed',
};

export const DEFAULT_DASHBOARD_REVENUE_FILTERS: DashboardRevenueFilters = {
  outcome: 'closed_won',
  assignedTo: null,
  locationId: null,
};

export function dashboardRevenueRpcParams(
  range: DashboardDateRange,
  filters: DashboardRevenueFilters,
) {
  return {
    p_start: range.start.toISOString(),
    p_end: range.end.toISOString(),
    p_outcome: filters.outcome,
    p_assigned_to: filters.assignedTo,
    p_location_id: filters.locationId,
  };
}

export function dashboardRevenueFilterSummary(
  filters: DashboardRevenueFilters,
  owners: DashboardRevenueFilterOption[],
  stores: DashboardRevenueFilterOption[],
): string {
  const outcome = DASHBOARD_REVENUE_OUTCOME_LABELS[filters.outcome];
  const owner = owners.find((option) => option.id === filters.assignedTo)?.name ?? 'All Owners';
  const store = stores.find((option) => option.id === filters.locationId)?.name ?? 'All Stores';
  return `${outcome} · ${owner} · ${store}`;
}
