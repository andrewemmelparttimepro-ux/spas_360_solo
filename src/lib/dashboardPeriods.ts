import {
  differenceInCalendarDays,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachWeekOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isWithinInterval,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subMonths,
} from 'date-fns';

// Reports intentionally uses only these three established periods.
export type DashboardPeriod = 'week' | 'month' | 'lastMonth';

export const PERIOD_LABELS: Record<DashboardPeriod, string> = {
  week: 'This Week',
  month: 'This Month',
  lastMonth: 'Last Month',
};

export type DashboardFilterPeriod = DashboardPeriod | 'allTime' | 'yearToDate' | 'custom';

export const DASHBOARD_PERIOD_LABELS: Record<DashboardFilterPeriod, string> = {
  ...PERIOD_LABELS,
  allTime: 'All Time',
  yearToDate: 'Year To Date',
  custom: 'Custom Dates',
};

export interface DashboardCustomRange {
  startDate: string;
  endDate: string;
}

export interface DashboardDateRange {
  start: Date;
  end: Date;
}

export interface DashboardDailyRevenue {
  d: string;
  v: number;
}

export interface DashboardRevenuePoint {
  name: string;
  revenue: number;
}

const ALL_TIME_START = new Date('0001-01-01T00:00:00.000Z');
const ALL_TIME_END = new Date('9999-12-31T23:59:59.999Z');

function parseDateInput(value: string, inclusiveEnd = false): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(0);
  parsed.setFullYear(year, month - 1, day);
  parsed.setHours(inclusiveEnd ? 23 : 0, inclusiveEnd ? 59 : 0, inclusiveEnd ? 59 : 0, inclusiveEnd ? 999 : 0);

  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export function dashboardRangeFor(
  period: DashboardFilterPeriod,
  customRange?: DashboardCustomRange | null,
  now = new Date(),
): DashboardDateRange | null {
  switch (period) {
    case 'week':
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
    case 'month':
      return { start: startOfMonth(now), end: endOfMonth(now) };
    case 'lastMonth': {
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    }
    case 'allTime':
      return { start: new Date(ALL_TIME_START), end: new Date(ALL_TIME_END) };
    case 'yearToDate':
      return { start: startOfYear(now), end: endOfDay(now) };
    case 'custom': {
      if (!customRange) return null;
      const start = parseDateInput(customRange.startDate);
      const end = parseDateInput(customRange.endDate, true);
      if (!start || !end || start > end) return null;
      return { start, end };
    }
  }
}

function revenueForInterval(daily: DashboardDailyRevenue[], start: Date, end: Date): number {
  return daily.reduce((sum, row) => {
    const day = new Date(`${row.d}T00:00:00`);
    return isWithinInterval(day, { start, end }) ? sum + (Number(row.v) || 0) : sum;
  }, 0);
}

function bucketByYears(daily: DashboardDailyRevenue[]): DashboardRevenuePoint[] {
  const byYear = new Map<string, number>();
  for (const row of daily) {
    const year = row.d.slice(0, 4);
    byYear.set(year, (byYear.get(year) ?? 0) + (Number(row.v) || 0));
  }
  return [...byYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, revenue]) => ({ name, revenue }));
}

/**
 * Maps the server's dealership-local daily revenue into bounded display buckets.
 * The SQL query owns filtering; this function only controls chart presentation.
 */
export function bucketDashboardRevenue(
  daily: DashboardDailyRevenue[],
  period: DashboardFilterPeriod,
  range: DashboardDateRange,
): DashboardRevenuePoint[] {
  const byDay = new Map(daily.map((row) => [row.d, Number(row.v) || 0]));

  if (period === 'week') {
    return eachDayOfInterval(range).map((day) => ({
      name: format(day, 'EEE'),
      revenue: byDay.get(format(day, 'yyyy-MM-dd')) ?? 0,
    }));
  }

  if (period === 'month' || period === 'lastMonth') {
    return eachWeekOfInterval(range, { weekStartsOn: 1 }).map((weekStart, index) => ({
      name: `Wk ${index + 1}`,
      revenue: revenueForInterval(daily, weekStart, endOfWeek(weekStart, { weekStartsOn: 1 })),
    }));
  }

  if (period === 'allTime') return bucketByYears(daily);

  if (period === 'yearToDate') {
    return eachMonthOfInterval(range).map((monthStart) => ({
      name: format(monthStart, 'MMM'),
      revenue: revenueForInterval(daily, monthStart, endOfMonth(monthStart)),
    }));
  }

  const days = differenceInCalendarDays(range.end, range.start) + 1;
  if (days <= 31) {
    return eachDayOfInterval(range).map((day) => ({
      name: format(day, 'MMM d'),
      revenue: byDay.get(format(day, 'yyyy-MM-dd')) ?? 0,
    }));
  }

  if (days <= 180) {
    return eachWeekOfInterval(range, { weekStartsOn: 1 }).map((weekStart) => {
      const bucketStart = weekStart < range.start ? range.start : weekStart;
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const bucketEnd = weekEnd > range.end ? range.end : weekEnd;
      return {
        name: format(bucketStart, 'MMM d'),
        revenue: revenueForInterval(daily, bucketStart, bucketEnd),
      };
    });
  }

  if (days <= 730) {
    return eachMonthOfInterval(range).map((monthStart) => ({
      name: format(monthStart, 'MMM yy'),
      revenue: revenueForInterval(daily, monthStart, endOfMonth(monthStart)),
    }));
  }

  return bucketByYears(daily);
}
