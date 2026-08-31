import { endOfMonth, endOfYear, startOfMonth, startOfYear } from 'date-fns';

export type OwnersReportOutcome = 'won' | 'lost';
export type OwnersReportPreset = 'this_month' | 'this_year' | 'compare_dates' | 'custom';

export const OWNERS_REPORT_PRESET_LABELS: Record<OwnersReportPreset, string> = {
  this_month: 'This Month',
  this_year: 'This Year',
  compare_dates: 'Compare Dates',
  custom: 'Custom Dates',
};

export interface OwnersReportRange { start: Date; end: Date }
export interface OwnersReportRanges { current: OwnersReportRange; prior: OwnersReportRange | null }
export interface OwnersReportCustomRange { startDate: string; endDate: string }
export interface OwnersReportComparisonPeriod extends OwnersReportCustomRange { year: string }
export interface OwnersReportComparison {
  firstPeriod: OwnersReportComparisonPeriod;
  comparedTo: OwnersReportComparisonPeriod;
}
export type OwnersReportDateSelection = OwnersReportCustomRange | OwnersReportComparison;

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

function comparisonPeriodRange(period: OwnersReportComparisonPeriod): OwnersReportRange | null {
  if (!/^\d{4}$/.test(period.year)) return null;
  const year = Number(period.year);
  const start = dateInput(period.startDate);
  const end = dateInput(period.endDate, true);
  if (!start || !end || start > end || start.getFullYear() !== year || end.getFullYear() !== year) return null;
  return { start, end };
}

export function ownersReportRanges(
  preset: OwnersReportPreset,
  selection?: OwnersReportDateSelection | null,
  now = new Date(),
): OwnersReportRanges | null {
  if (preset === 'custom') {
    const custom = selection && 'startDate' in selection ? selection : null;
    const start = custom ? dateInput(custom.startDate) : null;
    const end = custom ? dateInput(custom.endDate, true) : null;
    return start && end && start <= end ? { current: { start, end }, prior: null } : null;
  }
  if (preset === 'compare_dates') {
    const comparison = selection && 'firstPeriod' in selection ? selection : null;
    if (!comparison) return null;
    const current = comparisonPeriodRange(comparison.firstPeriod);
    const prior = comparisonPeriodRange(comparison.comparedTo);
    return current && prior ? { current, prior } : null;
  }
  if (preset === 'this_month') return { current: { start: startOfMonth(now), end: endOfMonth(now) }, prior: null };
  return { current: { start: startOfYear(now), end: endOfYear(now) }, prior: null };
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

export function reportDelta(current: ReturnType<typeof reportTotals>, comparison: ReturnType<typeof reportTotals>) {
  return { count: current.count - comparison.count, amount: current.amount - comparison.amount };
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
