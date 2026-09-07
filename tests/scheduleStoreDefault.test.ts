import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { scheduleStoreDefault } from '../src/lib/scheduleStoreDefault.ts';
import { parseDashboardScheduleFilter } from '../src/lib/dashboardSchedule.ts';

const locations = [{ id: 'minot' }, { id: 'bismarck' }];
const arrival = {
  navigationKey: 'first-visit',
  previousEntry: null,
  profile: { id: 'employee', location_id: 'bismarck' },
  locations,
  authLoading: false,
  allStores: false,
};

describe('Schedule home-store entry default', () => {
  it('waits for hydration and then chooses the employee home store', () => {
    assert.equal(scheduleStoreDefault({ ...arrival, authLoading: true }), null);
    assert.equal(scheduleStoreDefault({ ...arrival, profile: null }), null);
    assert.equal(scheduleStoreDefault(arrival)?.locationId, 'bismarck');
    assert.equal(scheduleStoreDefault({ ...arrival, profile: { id: 'other', location_id: 'minot' } })?.locationId, 'minot');
  });

  it('preserves manual All or other-store choices throughout the current visit', () => {
    const first = scheduleStoreDefault(arrival)!;
    for (const manualChoice of [null, 'minot']) {
      let activeLocation = manualChoice;
      // Auth/profile and location-list refreshes must not reapply the default.
      const rerender = scheduleStoreDefault({
        ...arrival,
        previousEntry: first.entry,
        profile: { ...arrival.profile },
        locations: [...locations],
      });
      if (rerender) activeLocation = rerender.locationId;
      assert.equal(activeLocation, manualChoice);
    }
  });

  it('reapplies home on another header navigation even if Schedule stays mounted', () => {
    const first = scheduleStoreDefault(arrival)!;
    assert.equal(scheduleStoreDefault({ ...arrival, previousEntry: first.entry }), null);
    assert.equal(scheduleStoreDefault({ ...arrival, previousEntry: first.entry, navigationKey: 'next-visit' })?.locationId, 'bismarck');
  });

  it('uses All when the home store is absent or unavailable', () => {
    for (const home of [null, '', 'deleted-store']) {
      assert.equal(scheduleStoreDefault({ ...arrival, profile: { id: 'employee', location_id: home } })?.locationId, null);
    }
    assert.equal(scheduleStoreDefault({ ...arrival, locations: [] })?.locationId, null);
  });

  it('preserves valid dashboard all-store links and applies home when cleared', () => {
    const filter = parseDashboardScheduleFilter('?date=2026-09-07&type=Service&stores=all&view=day');
    assert.ok(filter);
    assert.equal(scheduleStoreDefault({ ...arrival, allStores: filter !== null }), null);
    assert.equal(scheduleStoreDefault({ ...arrival, navigationKey: 'clear-dashboard-filter' })?.locationId, 'bismarck');
    const invalid = parseDashboardScheduleFilter('?date=invalid&type=Service&stores=all&view=day');
    assert.equal(scheduleStoreDefault({ ...arrival, allStores: invalid !== null })?.locationId, 'bismarck');
  });

  it('does not reuse a previous employee entry after the signed-in account changes', () => {
    const first = scheduleStoreDefault(arrival)!;
    assert.equal(scheduleStoreDefault({
      ...arrival,
      previousEntry: first.entry,
      profile: { id: 'another-employee', location_id: 'minot' },
    })?.locationId, 'minot');
  });
});
