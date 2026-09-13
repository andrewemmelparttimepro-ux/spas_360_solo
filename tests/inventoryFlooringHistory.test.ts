import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inventoryHistoryActor, inventoryHistoryDescription } from '../src/lib/inventoryFlooringHistory.ts';
import { inventoryFlooringDesignation, inventorySkuForFlooringDesignation } from '../src/lib/inventoryFlooringReport.ts';
import { splitSerialAndFlooring, joinSerialAndFlooring } from '../src/lib/inventoryFields.ts';

test('explicit Wells Fargo store designation survives the item location and a subsequent serial edit', () => {
  const sku = inventorySkuForFlooringDesignation('123 "Wells Fargo Bismarck"', 'Wells Fargo Minot');
  const item = { sku, notes: null, locations: { name: 'Bismarck (Spas Etc)' } };
  assert.equal(inventoryFlooringDesignation(item), 'Wells Fargo Minot');
  const parts = splitSerialAndFlooring(sku);
  assert.deepEqual(parts, { serial: '123', flooring: 'Wells Fargo Minot' });
  assert.equal(inventoryFlooringDesignation({ ...item, sku: joinSerialAndFlooring('456', parts.flooring) }), 'Wells Fargo Minot');
  assert.equal(inventoryFlooringDesignation({ ...item, sku: '456 Wells Fargo' }), 'Wells Fargo Bismarck');
  assert.equal(inventoryFlooringDesignation({ ...item, sku: '456 "Wells Fargo Bismarck"', locations: { name: 'Minot' } }), 'Wells Fargo Bismarck');
});

test('history distinguishes unknown historical actors from server operations and preserves attributable IDs', () => {
  assert.equal(inventoryHistoryActor({ actor_name: null, actor_id: null, source: 'legacy_record' }), 'Creator or actor not recorded');
  assert.equal(inventoryHistoryActor({ actor_name: null, actor_id: null, source: 'server' }), 'System / no signed-in user');
  assert.equal(inventoryHistoryActor({ actor_name: null, actor_id: 'known-actor', source: 'audit_log' }), 'User known-actor');
  assert.equal(inventoryHistoryActor({ actor_name: 'Brandon Solem', actor_id: 'known-actor', source: 'server' }), 'Brandon Solem');
});

test('history does not invent an initial designation for legacy creation and shows both sides of a change', () => {
  assert.equal(inventoryHistoryDescription({ event_type: 'created', before_designation: null, after_designation: null }), 'Inventory created');
  assert.equal(inventoryHistoryDescription({ event_type: 'created', before_designation: null, after_designation: '' }), 'Inventory created · Not designated');
  assert.equal(inventoryHistoryDescription({ event_type: 'flooring_changed', before_designation: 'MCHL TCCU', after_designation: 'Owned by MCHL' }), 'Flooring changed: MCHL TCCU → Owned by MCHL');
  assert.equal(inventoryHistoryDescription({ event_type: 'flooring_changed', before_designation: null, after_designation: 'Wells Fargo Minot' }), 'Flooring changed: Not designated → Wells Fargo Minot');
});
