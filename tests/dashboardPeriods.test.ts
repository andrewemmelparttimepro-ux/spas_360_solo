import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  DASHBOARD_PERIOD_LABELS,
  PERIOD_LABELS,
  bucketDashboardRevenue,
  dashboardRangeFor,
} from '../src/lib/dashboardPeriods.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function localParts(date: Date) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds(),
  };
}

describe('dashboard date periods', () => {
  const now = new Date(2026, 7, 25, 10, 30, 0, 0);

  it('keeps Reports on its three established periods while Dashboard exposes all six', () => {
    assert.deepEqual(Object.values(PERIOD_LABELS), ['This Week', 'This Month', 'Last Month']);
    assert.deepEqual(Object.values(DASHBOARD_PERIOD_LABELS), [
      'This Week',
      'This Month',
      'Last Month',
      'All Time',
      'Year To Date',
      'Custom Dates',
    ]);
  });

  it('preserves the established week, month, and last-month boundaries', () => {
    const week = dashboardRangeFor('week', null, now);
    const month = dashboardRangeFor('month', null, now);
    const lastMonth = dashboardRangeFor('lastMonth', null, now);

    assert.deepEqual(localParts(week!.start), { year: 2026, month: 8, day: 24, hour: 0, minute: 0, second: 0, millisecond: 0 });
    assert.deepEqual(localParts(week!.end), { year: 2026, month: 8, day: 30, hour: 23, minute: 59, second: 59, millisecond: 999 });
    assert.deepEqual(localParts(month!.start), { year: 2026, month: 8, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 });
    assert.deepEqual(localParts(month!.end), { year: 2026, month: 8, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999 });
    assert.deepEqual(localParts(lastMonth!.start), { year: 2026, month: 7, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 });
    assert.deepEqual(localParts(lastMonth!.end), { year: 2026, month: 7, day: 31, hour: 23, minute: 59, second: 59, millisecond: 999 });
  });

  it('uses complete All Time and inclusive Year To Date boundaries', () => {
    const allTime = dashboardRangeFor('allTime', null, now);
    const yearToDate = dashboardRangeFor('yearToDate', null, now);

    assert.equal(allTime!.start.toISOString(), '0001-01-01T00:00:00.000Z');
    assert.equal(allTime!.end.toISOString(), '9999-12-31T23:59:59.999Z');
    assert.deepEqual(localParts(yearToDate!.start), { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 });
    assert.deepEqual(localParts(yearToDate!.end), { year: 2026, month: 8, day: 25, hour: 23, minute: 59, second: 59, millisecond: 999 });
  });

  it('accepts an inclusive custom range and safely rejects incomplete, impossible, or reversed dates', () => {
    const custom = dashboardRangeFor('custom', { startDate: '2026-02-01', endDate: '2026-02-28' }, now);

    assert.deepEqual(localParts(custom!.start), { year: 2026, month: 2, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 });
    assert.deepEqual(localParts(custom!.end), { year: 2026, month: 2, day: 28, hour: 23, minute: 59, second: 59, millisecond: 999 });
    assert.equal(dashboardRangeFor('custom', { startDate: '', endDate: '2026-02-28' }, now), null);
    assert.equal(dashboardRangeFor('custom', { startDate: '2026-02-30', endDate: '2026-03-01' }, now), null);
    assert.equal(dashboardRangeFor('custom', { startDate: '2026-03-02', endDate: '2026-03-01' }, now), null);
  });

  it('recomputes bounded chart buckets for YTD, All Time, and custom dates', () => {
    const daily = [
      { d: '2025-12-31', v: 50 },
      { d: '2026-01-02', v: 100 },
      { d: '2026-02-14', v: 250 },
      { d: '2026-08-25', v: 400 },
    ];
    const yearToDate = dashboardRangeFor('yearToDate', null, now)!;
    const allTime = dashboardRangeFor('allTime', null, now)!;
    const custom = dashboardRangeFor('custom', { startDate: '2026-02-14', endDate: '2026-02-14' }, now)!;

    const ytdBuckets = bucketDashboardRevenue(daily.slice(1), 'yearToDate', yearToDate);
    assert.equal(ytdBuckets.length, 8);
    assert.deepEqual(ytdBuckets.slice(0, 2), [
      { name: 'Jan', revenue: 100 },
      { name: 'Feb', revenue: 250 },
    ]);
    assert.deepEqual(bucketDashboardRevenue(daily, 'allTime', allTime), [
      { name: '2025', revenue: 50 },
      { name: '2026', revenue: 750 },
    ]);
    assert.deepEqual(bucketDashboardRevenue(daily, 'custom', custom), [{ name: 'Feb 14', revenue: 250 }]);
  });

  it('wires a month-default Dashboard with validated custom controls without widening Reports', async () => {
    const [dashboard, dashboardHook, reports] = await Promise.all([
      read('src/pages/Dashboard.tsx'),
      read('src/hooks/useDashboard.ts'),
      read('src/pages/Reports.tsx'),
    ]);

    assert.match(dashboard, /const \[selectedPeriod, setSelectedPeriod\] = useState<DashboardFilterPeriod>\('month'\)/);
    assert.match(dashboard, /const \[appliedPeriod, setAppliedPeriod\] = useState<DashboardFilterPeriod>\('month'\)/);
    assert.match(dashboard, /Object\.keys\(DASHBOARD_PERIOD_LABELS\)/);
    assert.match(dashboard, /aria-label="Custom range start date"[\s\S]*type="date"/);
    assert.match(dashboard, /aria-label="Custom range end date"[\s\S]*type="date"/);
    assert.match(dashboard, /disabled=\{!validCustomRange\}/);
    assert.match(dashboardHook, /const fetchSequence = useRef\(0\)/);
    assert.match(dashboardHook, /if \(sequence !== fetchSequence\.current\) return/);
    assert.match(reports, /Object\.keys\(PERIOD_LABELS\)/);
    assert.doesNotMatch(reports, /DASHBOARD_PERIOD_LABELS/);
  });
});
