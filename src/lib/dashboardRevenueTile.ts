import { dealershipDate, scheduleCalendarDate, scheduleDayBounds } from './dashboardSchedule.ts';
import { dashboardRevenueRpcParams, type DashboardRevenueFilterOption } from './dashboardRevenueFilters.ts';
import type { DashboardDateRange } from './dashboardPeriods.ts';

export interface RevenueTileFilters {
  period: 'month' | 'custom';
  assignedTo: string | null;
  locationId: string | null;
  startDate: string;
  endDate: string;
}
export interface RevenueTileRange extends DashboardDateRange {
  startDate: string;
  endDate: string;
}
export interface RevenueTileReport {
  total: number;
  stores: { id: string; name: string; total: number }[];
  ownerOptions: DashboardRevenueFilterOption[];
  storeOptions: DashboardRevenueFilterOption[];
}
export type RevenueTileRpcParams = ReturnType<typeof dashboardRevenueRpcParams>;

export function revenueMonthDates(now = new Date()) {
  const date = dealershipDate(now);
  const [year, month] = date.split('-').map(Number);
  return {
    startDate: `${date.slice(0, 7)}-01`,
    endDate: new Date(Date.UTC(year, month, 0, 12)).toISOString().slice(0, 10),
  };
}

export function defaultRevenueTileFilters(now = new Date()): RevenueTileFilters {
  return { period: 'month', assignedTo: null, locationId: null, ...revenueMonthDates(now) };
}

export function revenueTileDateError(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate) return 'Choose a start and end date.';
  if (!scheduleCalendarDate(startDate) || !scheduleCalendarDate(endDate)) return 'Enter valid start and end dates.';
  if (startDate > endDate) return 'End date must be on or after start date.';
  return null;
}

export function revenueTileRange(filters: RevenueTileFilters, now = new Date()): RevenueTileRange | null {
  const dates = filters.period === 'month' ? revenueMonthDates(now) : filters;
  if (revenueTileDateError(dates.startDate, dates.endDate)) return null;
  try {
    return {
      startDate: dates.startDate,
      endDate: dates.endDate,
      start: new Date(scheduleDayBounds(dates.startDate).start),
      // The existing RPC uses BETWEEN, so pass an inclusive Central end date.
      end: new Date(new Date(scheduleDayBounds(dates.endDate).end).getTime() - 1),
    };
  } catch {
    return null;
  }
}

export function revenueTileRpcParams(range: DashboardDateRange, filters: RevenueTileFilters): RevenueTileRpcParams {
  const params = dashboardRevenueRpcParams(range, { outcome: 'closed_won', assignedTo: filters.assignedTo, locationId: filters.locationId });
  // PostgreSQL keeps microseconds. BETWEEN must include the entire last
  // millisecond of the chosen day, including server-written close timestamps.
  return { ...params, p_end: params.p_end.replace('.999Z', '.999999Z') };
}

export function revenueStoreLabel(name: string): string {
  return name.replace(/\s+\([^)]*\)$/, '');
}

function revenueTotal(data: unknown): number {
  const value = data && typeof data === 'object' ? (data as Record<string, unknown>).total_revenue : undefined;
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim()) || !Number.isFinite(Number(value))) {
    throw new Error('Revenue response was incomplete. Please retry.');
  }
  return Number(value);
}

function revenueOptions(data: unknown, key: string): DashboardRevenueFilterOption[] {
  const options = data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : undefined;
  if (!Array.isArray(options) || options.some(option => !option || typeof option.id !== 'string' || typeof option.name !== 'string')) {
    throw new Error('Revenue filter options could not load. Please retry.');
  }
  return options;
}

// Each result is an SQL aggregate, so neither store totals nor the selected
// all-store total can be truncated by PostgREST's row limit. A partial failure
// rejects the entire report instead of presenting an incorrect zero.
export async function loadRevenueTileReport(
  params: RevenueTileRpcParams,
  request: (params: RevenueTileRpcParams) => PromiseLike<{ data: unknown; error: { message: string } | null }>,
): Promise<RevenueTileReport> {
  const result = await request(params);
  if (result.error) throw new Error(result.error.message);
  const total = revenueTotal(result.data);
  const ownerOptions = revenueOptions(result.data, 'owner_options');
  const storeOptions = revenueOptions(result.data, 'store_options');
  if (params.p_location_id && !storeOptions.some(store => store.id === params.p_location_id)) {
    throw new Error('The selected store is no longer available. Choose another store.');
  }
  if (params.p_assigned_to && !ownerOptions.some(owner => owner.id === params.p_assigned_to)) {
    throw new Error('The selected sales person is no longer available. Choose another sales person.');
  }
  const stores = await Promise.all(storeOptions
    .filter(store => !params.p_location_id || store.id === params.p_location_id)
    .map(async store => {
      if (params.p_location_id === store.id) return { ...store, total };
      const storeResult = await request({ ...params, p_location_id: store.id });
      if (storeResult.error) throw new Error(storeResult.error.message);
      return { ...store, total: revenueTotal(storeResult.data) };
    }));
  return { total, stores, ownerOptions, storeOptions };
}
