import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { resolveCreationStore } from '../src/lib/creationStore.ts';

const locations = [{ id: 'minot' }, { id: 'bismarck' }];
const base = { selectedLocationId: null, locations };

describe('customer and deal store selection', () => {
  it('defaults new customers to the active store, then the employee home store', () => {
    assert.equal(resolveCreationStore({ ...base, activeLocationId: 'bismarck', profileLocationId: 'minot' }), 'bismarck');
    assert.equal(resolveCreationStore({ ...base, activeLocationId: null, profileLocationId: 'minot' }), 'minot');
    assert.equal(resolveCreationStore(base), '');
  });

  it('defaults an existing customer deal to their store while allowing independent assignment', () => {
    const context = { ...base, customerLocationId: 'minot', activeLocationId: 'bismarck', profileLocationId: 'minot' };
    assert.equal(resolveCreationStore(context), 'minot');
    assert.equal(resolveCreationStore({ ...context, selectedLocationId: 'bismarck' }), 'bismarck');
  });

  it('waits for location hydration and preserves explicit choice through customer and profile refreshes', () => {
    const selection = { ...base, selectedLocationId: 'bismarck', profileLocationId: 'minot' };
    assert.equal(resolveCreationStore({ ...selection, locations: [] }), '');
    assert.equal(resolveCreationStore(selection), 'bismarck');
    for (const customerLocationId of [undefined, 'minot', 'bismarck']) {
      assert.equal(resolveCreationStore({ ...selection, customerLocationId, activeLocationId: 'minot', locations: [...locations] }), 'bismarck');
    }
  });

  it('requires a choice when an explicitly selected store disappears, without reassigning to home', () => {
    assert.equal(resolveCreationStore({ ...base, selectedLocationId: 'bismarck', locations: [{ id: 'minot' }], profileLocationId: 'minot' }), '');
    assert.equal(resolveCreationStore({ ...base, customerLocationId: 'deleted', activeLocationId: 'minot' }), 'minot');
  });

  it('keeps the latest won-delivery SQL contract tied to the deal store before the actor store', () => {
    const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
    const bridges = readdirSync(migrationDirectory).filter(name => name.endsWith('.sql')).sort()
      .map(name => readFileSync(new URL(name, migrationDirectory), 'utf8'))
      .filter(sql => /create or replace function public\.deal_won_bridge\(\)/i.test(sql));
    const latest = bridges.at(-1);
    assert.ok(latest, 'a won-delivery bridge must exist');
    assert.match(latest, /select coalesce\(\s*new\.location_id,\s*\(select p\.location_id[\s\S]*?\) into v_location;/);
    assert.match(latest, /insert into public\.jobs \(org_id, contact_id, location_id,[\s\S]*?values \(\s*new\.org_id, new\.contact_id, v_location,/);
  });
});
