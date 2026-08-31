import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  OWNERS_REPORT_PRESET_LABELS,
  closedDealsForRange,
  closingRates,
  ownersReportRanges,
  reportDelta,
  reportTotals,
  type OwnersReportDeal,
} from '../src/lib/ownersReport.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

function localParts(date: Date) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
}

const deals: OwnersReportDeal[] = [
  { id: 'won-current', title: 'Won', amount: 1000, assigned_to: 'p1', location_id: 's1', created_at: '2026-08-02T12:00:00Z', closed_at: '2026-08-20T12:00:00Z', stage: { is_won: true, is_lost: false } },
  { id: 'lost-current', title: 'Lost', amount: 200, assigned_to: 'p1', location_id: 's1', created_at: '2026-08-03T12:00:00Z', closed_at: '2026-08-21T12:00:00Z', stage: { is_won: false, is_lost: true } },
  { id: 'won-other', title: 'Other store', amount: 500, assigned_to: 'p2', location_id: 's2', created_at: '2026-08-04T12:00:00Z', closed_at: '2026-08-22T12:00:00Z', stage: { is_won: true, is_lost: false } },
  { id: 'won-prior', title: 'Prior', amount: 800, assigned_to: 'p1', location_id: 's1', created_at: '2025-08-02T12:00:00Z', closed_at: '2025-08-20T12:00:00Z', stage: { is_won: true, is_lost: false } },
  { id: 'open', title: 'Open', amount: 100, assigned_to: 'p2', location_id: 's2', created_at: '2026-08-05T12:00:00Z', closed_at: null, stage: { is_won: false, is_lost: false } },
];

describe('Owners Corner sales reports', () => {
  const now = new Date(2026, 7, 25, 10, 30);

  it('builds the exact standard periods and only exposes the requested presets', async () => {
    const month = ownersReportRanges('this_month', null, now)!;
    const year = ownersReportRanges('this_year', null, now)!;
    assert.deepEqual(localParts(month.current.start), [2026, 8, 1, 0, 0]);
    assert.deepEqual(localParts(month.current.end), [2026, 8, 31, 23, 59]);
    assert.deepEqual(localParts(year.current.start), [2026, 1, 1, 0, 0]);
    assert.deepEqual(localParts(year.current.end), [2026, 12, 31, 23, 59]);
    assert.deepEqual(OWNERS_REPORT_PRESET_LABELS, {
      this_month: 'This Month',
      this_year: 'This Year',
      compare_dates: 'Compare Dates',
      custom: 'Custom Dates',
    });
  });

  it('rejects invalid custom dates', () => {
    assert.equal(ownersReportRanges('custom', { startDate: '2026-02-30', endDate: '2026-03-01' }), null);
    assert.equal(ownersReportRanges('custom', { startDate: '2026-03-02', endDate: '2026-03-01' }), null);
    const custom = ownersReportRanges('custom', { startDate: '2026-03-01', endDate: '2026-03-02' })!;
    assert.deepEqual(localParts(custom.current.end), [2026, 3, 2, 23, 59]);
  });

  it('builds two independently chosen comparison periods and enforces each selected year', () => {
    const comparison = ownersReportRanges('compare_dates', {
      firstPeriod: { year: '2026', startDate: '2026-03-02', endDate: '2026-06-30' },
      comparedTo: { year: '2024', startDate: '2024-01-15', endDate: '2024-02-29' },
    })!;
    assert.deepEqual(localParts(comparison.current.start), [2026, 3, 2, 0, 0]);
    assert.deepEqual(localParts(comparison.current.end), [2026, 6, 30, 23, 59]);
    assert.deepEqual(localParts(comparison.prior!.start), [2024, 1, 15, 0, 0]);
    assert.deepEqual(localParts(comparison.prior!.end), [2024, 2, 29, 23, 59]);
    assert.equal(ownersReportRanges('compare_dates', {
      firstPeriod: { year: '2026', startDate: '2025-12-31', endDate: '2026-01-31' },
      comparedTo: { year: '2025', startDate: '2025-01-01', endDate: '2025-12-31' },
    }), null);
    assert.equal(ownersReportRanges('compare_dates', {
      firstPeriod: { year: '2026', startDate: '2026-03-02', endDate: '2026-03-01' },
      comparedTo: { year: '2025', startDate: '2025-01-01', endDate: '2025-12-31' },
    }), null);
  });

  it('independently filters outcome, store, salesperson, and closed date then totals the cohort', () => {
    const range = ownersReportRanges('this_month', null, now)!.current;
    assert.deepEqual(closedDealsForRange(deals, range, 'won', null, null).map(deal => deal.id), ['won-current', 'won-other']);
    assert.deepEqual(closedDealsForRange(deals, range, 'lost', 's1', 'p1').map(deal => deal.id), ['lost-current']);
    assert.deepEqual(reportTotals(closedDealsForRange(deals, range, 'won', 's1', null)), { count: 1, amount: 1000 });
    assert.deepEqual(reportDelta({ count: 3, amount: 2400 }, { count: 5, amount: 1900 }), { count: -2, amount: 500 });
  });

  it('calculates assigned-lead and Closed-Won rates by salesperson and store from created-date cohorts', () => {
    const range = ownersReportRanges('this_month', null, now)!.current;
    const people = closingRates(deals, range, 'salesperson', new Map([['p1', 'Alex'], ['p2', 'Blair']]));
    const stores = closingRates(deals, range, 'store', new Map([['s1', 'North'], ['s2', 'South']]));
    assert.deepEqual(people, [
      { id: 'p1', name: 'Alex', assigned: 2, won: 1, rate: 0.5 },
      { id: 'p2', name: 'Blair', assigned: 2, won: 1, rate: 0.5 },
    ]);
    assert.deepEqual(stores, [
      { id: 's1', name: 'North', assigned: 2, won: 1, rate: 0.5 },
      { id: 's2', name: 'South', assigned: 2, won: 1, rate: 0.5 },
    ]);
  });

  it('wires all requested controls and keeps reads organization scoped', async () => {
    const [page, hook] = await Promise.all([read('src/pages/OwnersCorner.tsx'), read('src/hooks/useOwnersReport.ts')]);
    assert.match(page, /Closed-Won/);
    assert.match(page, /Closed-Lost/);
    assert.match(page, /All Stores/);
    assert.match(page, /All Salespeople/);
    assert.match(page, /Owner report start date[\s\S]*type="date"/);
    assert.match(page, /First comparison period[\s\S]*Compared to[\s\S]*Year[\s\S]*Start Date[\s\S]*End Date/);
    assert.match(page, /Comparison delta[\s\S]*First period minus Compared to/);
    assert.match(page, /First period deals[\s\S]*Compared to deals/);
    assert.match(page, /Assigned Leads[\s\S]*Closed-Won[\s\S]*Rate/);
    assert.match(page, /By Salesperson/);
    assert.match(page, /By Store/);
    assert.match(hook, /\.from\('deals'\)[\s\S]*\.eq\('org_id', orgId\)/);
    assert.match(hook, /DEAL_PAGE_SIZE = 1000[\s\S]*\.range\(from, from \+ DEAL_PAGE_SIZE - 1\)/);
    assert.match(hook, /\.from\('locations'\)[\s\S]*\.eq\('org_id', profile\.org_id\)/);
    assert.match(hook, /\.from\('profiles'\)[\s\S]*\.eq\('org_id', profile\.org_id\)/);
    assert.match(hook, /\.neq\('id', THRAWN_PROFILE_ID\)/);
  });
});
