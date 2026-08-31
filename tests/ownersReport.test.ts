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
import { buildOwnersReportPdf, salespersonGrossRanking } from '../src/lib/ownersReportPdf.ts';

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

  it('ranks salespeople by gross Closed-Won dollars and retains each individual sale', () => {
    const p2SecondDeal: OwnersReportDeal = {
      ...deals[2],
      id: 'won-other-second',
      title: 'Other second sale',
      amount: 400,
      closed_at: '2026-08-23T12:00:00Z',
    };
    const rows = salespersonGrossRanking([deals[0], deals[2], p2SecondDeal, deals[1]], new Map([['p1', 'Alex'], ['p2', 'Blair']]));
    assert.deepEqual(rows.map(row => ({ id: row.id, wonCount: row.wonCount, totalAmount: row.totalAmount })), [
      { id: 'p1', wonCount: 1, totalAmount: 1000 },
      { id: 'p2', wonCount: 2, totalAmount: 900 },
    ]);
    assert.deepEqual(rows[1].deals.map(deal => deal.id), ['won-other', 'won-other-second']);
  });

  it('wires all requested controls and keeps reads organization scoped', async () => {
    const [page, hook, pdf] = await Promise.all([
      read('src/pages/OwnersCorner.tsx'),
      read('src/hooks/useOwnersReport.ts'),
      read('src/lib/ownersReportPdf.ts'),
    ]);
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
    assert.match(page, /View printable PDF/);
    assert.match(page, /Apply dates &amp; view PDF/);
    assert.match(page, /viewOwnersReportPdf/);
    assert.match(page, /rateDeals[\s\S]*locationId[\s\S]*assignedTo/);
    assert.match(page, /nextRanges[\s\S]*openPrintablePdf\(nextRanges, selectedPreset\)/);
    assert.match(pdf, /window\.open\('', '_blank'\)[\s\S]*preview\.location\.replace\(url\)/);
    assert.match(pdf, /fetch\('\/mchl-duck-dashboard\.png'/);
    assert.doesNotMatch(pdf, /\.save\(|\.download\s*=/);
    assert.match(hook, /\.from\('deals'\)[\s\S]*\.eq\('org_id', orgId\)/);
    assert.match(hook, /DEAL_PAGE_SIZE = 1000[\s\S]*\.range\(from, from \+ DEAL_PAGE_SIZE - 1\)/);
    assert.match(hook, /\.from\('locations'\)[\s\S]*\.eq\('org_id', profile\.org_id\)/);
    assert.match(hook, /\.from\('profiles'\)[\s\S]*\.eq\('org_id', profile\.org_id\)/);
    assert.match(hook, /\.neq\('id', THRAWN_PROFILE_ID\)/);
  });

  it('builds a viewable PDF with applied filters, periods, deals, delta, and closing-rate tables', async () => {
    const currentDeals = [deals[0], deals[2]];
    const comparedDeals = [deals[3]];
    const duckBytes = await readFile(new URL('../public/mchl-duck-dashboard.png', import.meta.url));
    const bytes = await buildOwnersReportPdf({
      generatedAt: new Date('2026-08-30T20:00:00-05:00'),
      outcome: 'won',
      store: 'All Stores',
      salesperson: 'All Salespeople',
      dateSelection: 'Compare Dates',
      current: { title: 'First period', range: 'Aug 1, 2026 - Aug 31, 2026', deals: currentDeals, totalCount: 2, totalAmount: 1500 },
      comparedTo: { title: 'Compared to', range: 'Aug 1, 2025 - Aug 31, 2025', deals: comparedDeals, totalCount: 1, totalAmount: 800 },
      delta: { count: 1, amount: 700 },
      salespersonRates: [{ id: 'p1', name: 'Alex', assigned: 2, won: 1, rate: 0.5 }],
      storeRates: [{ id: 's1', name: 'North', assigned: 2, won: 1, rate: 0.5 }],
      storeNames: new Map([['s1', 'North'], ['s2', 'South']]),
      salespersonNames: new Map([['p1', 'Alex'], ['p2', 'Blair']]),
      grossSalesRanking: salespersonGrossRanking(currentDeals, new Map([['p1', 'Alex'], ['p2', 'Blair']])),
      duckLogoDataUrl: `data:image/png;base64,${duckBytes.toString('base64')}`,
    });
    assert.equal(Buffer.from(bytes.subarray(0, 5)).toString('ascii'), '%PDF-');
    const source = Buffer.from(bytes).toString('latin1');
    assert.match(source, /\(Sales Outcome\) Tj/);
    assert.doesNotMatch(source, /Sales Outcome & Closing Rate/);
    assert.match(source, /Compare Dates/);
    assert.match(source, /Other store/);
    assert.match(source, /COMPARISON DELTA/i);
    assert.match(source, /By Salesperson/);
    assert.match(source, /By Store/);
    assert.match(source, /Salesperson Gross Sales Ranking/);
    assert.match(source, /Salesperson Total/);
    assert.match(source, /\/Subtype \/Image/);
  });
});
