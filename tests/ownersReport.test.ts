import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  closedDealsForRange,
  closingRates,
  ownersReportRanges,
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

  it('builds the exact standard and comparison periods', () => {
    const month = ownersReportRanges('this_month', null, now)!;
    const year = ownersReportRanges('this_year', null, now)!;
    const monthComparison = ownersReportRanges('month_vs_last_year', null, now)!;
    const ytdComparison = ownersReportRanges('ytd_vs_prior_ytd', null, now)!;
    assert.deepEqual(localParts(month.current.start), [2026, 8, 1, 0, 0]);
    assert.deepEqual(localParts(month.current.end), [2026, 8, 31, 23, 59]);
    assert.deepEqual(localParts(year.current.start), [2026, 1, 1, 0, 0]);
    assert.deepEqual(localParts(year.current.end), [2026, 12, 31, 23, 59]);
    assert.deepEqual(localParts(monthComparison.prior!.start), [2025, 8, 1, 0, 0]);
    assert.deepEqual(localParts(monthComparison.prior!.end), [2025, 8, 31, 23, 59]);
    assert.deepEqual(localParts(ytdComparison.prior!.end), [2025, 8, 25, 23, 59]);
  });

  it('clamps leap-day prior YTD and rejects invalid custom dates', () => {
    const leap = ownersReportRanges('ytd_vs_prior_ytd', null, new Date(2024, 1, 29, 9, 0))!;
    assert.deepEqual(localParts(leap.prior!.end), [2023, 2, 28, 23, 59]);
    assert.equal(ownersReportRanges('custom', { startDate: '2026-02-30', endDate: '2026-03-01' }), null);
    assert.equal(ownersReportRanges('custom', { startDate: '2026-03-02', endDate: '2026-03-01' }), null);
    const custom = ownersReportRanges('custom', { startDate: '2026-03-01', endDate: '2026-03-02' })!;
    assert.deepEqual(localParts(custom.current.end), [2026, 3, 2, 23, 59]);
  });

  it('independently filters outcome, store, salesperson, and closed date then totals the cohort', () => {
    const range = ownersReportRanges('this_month', null, now)!.current;
    assert.deepEqual(closedDealsForRange(deals, range, 'won', null, null).map(deal => deal.id), ['won-current', 'won-other']);
    assert.deepEqual(closedDealsForRange(deals, range, 'lost', 's1', 'p1').map(deal => deal.id), ['lost-current']);
    assert.deepEqual(reportTotals(closedDealsForRange(deals, range, 'won', 's1', null)), { count: 1, amount: 1000 });
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
