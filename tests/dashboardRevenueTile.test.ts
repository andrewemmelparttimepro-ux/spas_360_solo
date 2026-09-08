import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultRevenueTileFilters, loadRevenueTileReport, revenueMonthDates, revenueStoreLabel, revenueTileDateError, revenueTileRange, revenueTileRpcParams } from '../src/lib/dashboardRevenueTile.ts';

const now = new Date('2026-09-07T16:00:00Z');
const ownerOptions = [{ id: 'owner-brandon', name: 'Brandon Solem' }, { id: 'owner-other', name: 'Other Person' }];
const storeOptions = [{ id: 'store-bismarck', name: "Bismarck (Spa's Etc)" }, { id: 'store-minot', name: 'Minot (MCHL)' }];
const response = (total: number | string) => ({ total_revenue: total, owner_options: ownerOptions, store_options: storeOptions });
const defaultParams = () => {
  const filters = defaultRevenueTileFilters(now);
  return revenueTileRpcParams(revenueTileRange(filters, now)!, filters);
};

describe('monthly revenue tile date and filter contract', () => {
  it('defaults independently to This Month and all people/stores with inclusive Central bounds', () => {
    const filters = defaultRevenueTileFilters(now);
    assert.deepEqual(filters, { period: 'month', assignedTo: null, locationId: null, startDate: '2026-09-01', endDate: '2026-09-30' });
    assert.deepEqual(defaultParams(), {
      p_start: '2026-09-01T05:00:00.000Z', p_end: '2026-10-01T04:59:59.999999Z',
      p_outcome: 'closed_won', p_assigned_to: null, p_location_id: null,
    });
    filters.assignedTo = 'different-person';
    filters.locationId = 'different-store';
    filters.period = 'custom';
    assert.equal(defaultRevenueTileFilters(now).assignedTo, null);
    assert.equal(defaultRevenueTileFilters(now).locationId, null);
    assert.equal(defaultRevenueTileFilters(now).period, 'month');
  });

  it('rolls to the new month only at Central midnight, in summer and winter', () => {
    assert.deepEqual(revenueMonthDates(new Date('2026-09-01T04:59:59.999Z')), { startDate: '2026-08-01', endDate: '2026-08-31' });
    assert.deepEqual(revenueMonthDates(new Date('2026-09-01T05:00:00Z')), { startDate: '2026-09-01', endDate: '2026-09-30' });
    assert.deepEqual(revenueMonthDates(new Date('2027-01-01T05:59:59.999Z')), { startDate: '2026-12-01', endDate: '2026-12-31' });
    assert.deepEqual(revenueMonthDates(new Date('2027-01-01T06:00:00Z')), { startDate: '2027-01-01', endDate: '2027-01-31' });
    assert.deepEqual(revenueMonthDates(new Date('2028-02-14T18:00:00Z')), { startDate: '2028-02-01', endDate: '2028-02-29' });
    // A mounted default filter retains its defaults while its current month advances.
    const oldDefaults = defaultRevenueTileFilters(new Date('2026-08-31T23:00:00Z'));
    assert.equal(revenueTileRange(oldDefaults, new Date('2026-09-01T05:00:00Z'))?.startDate, '2026-09-01');
  });

  it('combines owner/store filters with full custom dates across DST boundaries', () => {
    const filters = { ...defaultRevenueTileFilters(now), period: 'custom' as const, assignedTo: 'owner-brandon', locationId: 'store-minot', startDate: '2026-03-08', endDate: '2026-03-08' };
    const range = revenueTileRange(filters, now)!;
    assert.equal(range.end.getTime() - range.start.getTime() + 1, 23 * 60 * 60 * 1000);
    assert.deepEqual(revenueTileRpcParams(range, filters), {
      p_start: '2026-03-08T06:00:00.000Z', p_end: '2026-03-09T04:59:59.999999Z',
      p_outcome: 'closed_won', p_assigned_to: 'owner-brandon', p_location_id: 'store-minot',
    });
    const autumn = revenueTileRange({ ...filters, startDate: '2026-11-01', endDate: '2026-11-01' }, now)!;
    assert.equal(autumn.end.getTime() - autumn.start.getTime() + 1, 25 * 60 * 60 * 1000);
    assert.equal(autumn.start.toISOString(), '2026-11-01T05:00:00.000Z');
    assert.equal(autumn.end.toISOString(), '2026-11-02T05:59:59.999Z');
  });

  it('rejects missing, impossible and reversed custom dates while accepting a single day', () => {
    for (const [startDate, endDate] of [['', '2026-09-07'], ['2026-09-07', ''], ['2026-02-29', '2026-03-01'], ['2026-9-7', '2026-09-07'], ['2026-09-08', '2026-09-07']]) {
      assert.ok(revenueTileDateError(startDate, endDate));
      assert.equal(revenueTileRange({ ...defaultRevenueTileFilters(now), period: 'custom', startDate, endDate }, now), null);
    }
    assert.equal(revenueTileDateError('2026-09-07', '2026-09-07'), null);
  });
});

describe('revenue aggregate report requests', () => {
  it('returns both actual store totals under readable names and preserves the all-store aggregate', async () => {
    const calls: ReturnType<typeof defaultParams>[] = [];
    const report = await loadRevenueTileReport(defaultParams(), async params => {
      calls.push(params);
      const totals = { 'store-bismarck': 125000.75, 'store-minot': 21000 };
      return { data: response(params.p_location_id ? totals[params.p_location_id as keyof typeof totals] : 146000.75), error: null };
    });
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(call => call.p_location_id), [null, 'store-bismarck', 'store-minot']);
    assert.ok(calls.every(call => call.p_outcome === 'closed_won' && call.p_assigned_to === null && call.p_start === defaultParams().p_start && call.p_end === defaultParams().p_end));
    assert.equal(report.total, 146000.75);
    assert.deepEqual(report.stores.map(store => ({ name: revenueStoreLabel(store.name), total: store.total })), [
      { name: 'Bismarck', total: 125000.75 }, { name: 'Minot', total: 21000 },
    ]);
  });

  it('requeries the selected sales person and store without including the other store', async () => {
    const params = { ...defaultParams(), p_assigned_to: 'owner-brandon', p_location_id: 'store-minot' };
    const calls: typeof params[] = [];
    const report = await loadRevenueTileReport(params, async received => {
      calls.push(received as typeof params);
      return { data: response('999.99'), error: null };
    });
    assert.deepEqual(calls, [params]);
    assert.deepEqual(report.stores, [{ ...storeOptions[1], total: 999.99, missingAmounts: null }]);
    assert.equal(report.total, 999.99);
    assert.deepEqual(report.ownerOptions, ownerOptions);
    assert.deepEqual(report.storeOptions, storeOptions);
  });

  it('applies the selected person to every store request when returning to All Stores', async () => {
    const params = { ...defaultParams(), p_assigned_to: 'owner-brandon' };
    const calls: typeof params[] = [];
    await loadRevenueTileReport(params, async received => {
      calls.push(received as typeof params);
      return { data: response(0), error: null };
    });
    assert.deepEqual(calls.map(call => [call.p_assigned_to, call.p_location_id]), [
      ['owner-brandon', null], ['owner-brandon', 'store-bismarck'], ['owner-brandon', 'store-minot'],
    ]);
  });

  it('rejects RPC and partial-store failures instead of turning them into zero revenue', async () => {
    await assert.rejects(loadRevenueTileReport(defaultParams(), async () => ({ data: null, error: { message: 'Permission denied' } })), /Permission denied/);
    await assert.rejects(loadRevenueTileReport(defaultParams(), async params => params.p_location_id === 'store-minot'
      ? { data: null, error: { message: 'Store query failed' } }
      : { data: response(500), error: null }), /Store query failed/);
  });

  it('rejects missing or malformed amounts/options but keeps real zero and decimal totals', async () => {
    for (const badData of [null, {}, { ...response(0), total_revenue: null }, { ...response(0), total_revenue: '' }, { ...response(0), total_revenue: 'NaN' }, { ...response(0), store_options: null }]) {
      await assert.rejects(loadRevenueTileReport(defaultParams(), async () => ({ data: badData, error: null })));
    }
    const zero = await loadRevenueTileReport(defaultParams(), async () => ({ data: response(0), error: null }));
    assert.equal(zero.total, 0);
    assert.deepEqual(zero.stores.map(store => store.total), [0, 0]);
  });

  it('rejects stale unavailable selections rather than labeling them as All Stores or All Sales People', async () => {
    await assert.rejects(loadRevenueTileReport({ ...defaultParams(), p_location_id: 'removed-store' }, async () => ({ data: response(0), error: null })), /selected store is no longer available/);
    await assert.rejects(loadRevenueTileReport({ ...defaultParams(), p_assigned_to: 'removed-owner' }, async () => ({ data: response(0), error: null })), /selected sales person is no longer available/);
  });
});
