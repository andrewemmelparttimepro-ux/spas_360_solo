import { endOfDay, endOfMonth, endOfYear, startOfMonth, startOfYear } from 'date-fns';

export type OwnersReportOutcome = 'won' | 'lost';
export type OwnersReportPreset = 'this_month' | 'this_year' | 'month_vs_last_year' | 'ytd_vs_prior_ytd' | 'custom';

export const OWNERS_REPORT_PRESET_LABELS: Record<OwnersReportPreset, string> = {
  this_month: 'This Month',
  this_year: 'This Year',
  month_vs_last_year: 'This Month vs Same Month Last Year',
  ytd_vs_prior_ytd: 'This Year To Date vs Prior Year To Date',
  custom: 'Custom Dates',
};

export interface OwnersReportRange { start: Date; end: Date }
export interface OwnersReportRanges { current: OwnersReportRange; prior: OwnersReportRange | null }
export interface OwnersReportCustomRange { startDate: string; endDate: string }

export interface OwnersReportDeal {
  id: string;
  title: string;
  amount: number | null;
  assigned_to: string | null;
  location_id: string | null;
  closed_at: string | null;
  created_at: string;
  stage: { is_won: boolean; is_lost: boolean } | null;
}

function dateInput(value: string, end = false): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(0);
  date.setFullYear(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  date.setHours(end ? 23 : 0, end ? 59 : 0, end ? 59 : 0, end ? 999 : 0);
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;
  return date;
}

function priorYear(date: Date): Date {
  const result = new Date(date);
  const month = result.getMonth();
  result.setFullYear(result.getFullYear() - 1);
  if (result.getMonth() !== month) result.setDate(0); // February 29 -> February 28
  return result;
}

export function ownersReportRanges(
  preset: OwnersReportPreset,
  custom?: OwnersReportCustomRange | null,
  now = new Date(),
): OwnersReportRanges | null {
  if (preset === 'custom') {
    const start = custom ? dateInput(custom.startDate) : null;
    const end = custom ? dateInput(custom.endDate, true) : null;
    return start && end && start <= end ? { current: { start, end }, prior: null } : null;
  }
  if (preset === 'this_month') return { current: { start: startOfMonth(now), end: endOfMonth(now) }, prior: null };
  if (preset === 'this_year') return { current: { start: startOfYear(now), end: endOfYear(now) }, prior: null };
  if (preset === 'month_vs_last_year') {
    const prior = priorYear(now);
    return {
      current: { start: startOfMonth(now), end: endOfMonth(now) },
      prior: { start: startOfMonth(prior), end: endOfMonth(prior) },
    };
  }
  const currentEnd = endOfDay(now);
  const priorEnd = endOfDay(priorYear(now));
  return {
    current: { start: startOfYear(now), end: currentEnd },
    prior: { start: startOfYear(priorEnd), end: priorEnd },
  };
}

export function dealInRange(value: string | null, range: OwnersReportRange): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date >= range.start && date <= range.end;
}

export function closedDealsForRange(
  deals: OwnersReportDeal[],
  range: OwnersReportRange,
  outcome: OwnersReportOutcome,
  locationId: string | null,
  assignedTo: string | null,
): OwnersReportDeal[] {
  return deals.filter((deal) =>
    dealInRange(deal.closed_at, range)
    && (outcome === 'won' ? deal.stage?.is_won : deal.stage?.is_lost)
    && (!locationId || deal.location_id === locationId)
    && (!assignedTo || deal.assigned_to === assignedTo));
}

export function reportTotals(deals: OwnersReportDeal[]) {
  return { count: deals.length, amount: deals.reduce((total, deal) => total + (Number(deal.amount) || 0), 0) };
}

export interface ClosingRateRow { id: string; name: string; assigned: number; won: number; rate: number }

export function closingRates(
  deals: OwnersReportDeal[],
  range: OwnersReportRange,
  dimension: 'salesperson' | 'store',
  names: Map<string, string>,
): ClosingRateRow[] {
  const grouped = new Map<string, { assigned: number; won: number }>();
  for (const deal of deals) {
    if (!dealInRange(deal.created_at, range)) continue;
    const id = dimension === 'salesperson' ? deal.assigned_to : deal.location_id;
    if (!id) continue;
    const row = grouped.get(id) ?? { assigned: 0, won: 0 };
    row.assigned += 1;
    if (deal.stage?.is_won) row.won += 1;
    grouped.set(id, row);
  }
  return [...grouped.entries()].map(([id, row]) => ({
    id,
    name: names.get(id) ?? 'Unknown',
    ...row,
    rate: row.assigned ? row.won / row.assigned : 0,
  })).sort((a, b) => b.rate - a.rate || b.assigned - a.assigned || a.name.localeCompare(b.name));
}
