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

const recordedActor = { actor_name: 'Brandon Solem', actor_id: 'known-actor', source: 'server' as const };

test('history does not invent an initial designation for legacy creation', () => {
  const creation = { event_type: 'created' as const, before_designation: null, actor_name: null, actor_id: null, source: 'legacy_record' as const };
  assert.equal(inventoryHistoryDescription({ ...creation, after_designation: null }), 'Inventory created');
  assert.equal(inventoryHistoryDescription({ ...creation, after_designation: '' }), 'Inventory created · Not designated');
});

test('flooring changes name the full actor and both store designations in a sentence', () => {
  const change = { ...recordedActor, event_type: 'flooring_changed' as const, before_designation: 'MCHL TCCU', after_designation: 'Wells Fargo Minot' };
  assert.equal(inventoryHistoryDescription(change), 'User Brandon Solem changed the inventory flooring status from "Minot TCCU" to "Minot Wells Fargo".');
  assert.equal(inventoryHistoryDescription({ ...change, before_designation: 'Spas Etc TCCU', after_designation: 'Wells Fargo Bismarck' }), 'User Brandon Solem changed the inventory flooring status from "Bismarck TCCU" to "Bismarck Wells Fargo".');
  assert.equal(change.before_designation, 'MCHL TCCU');
  assert.equal(change.after_designation, 'Wells Fargo Minot');
});

test('history preserves other designation labels and explains an unset old or new value', () => {
  const change = { ...recordedActor, event_type: 'flooring_changed' as const };
  assert.equal(inventoryHistoryDescription({ ...change, before_designation: null, after_designation: 'Owned by MCHL' }), 'User Brandon Solem changed the inventory flooring status from "Not designated" to "Owned by MCHL".');
  assert.equal(inventoryHistoryDescription({ ...change, before_designation: 'Consignment from Jane', after_designation: '' }), 'User Brandon Solem changed the inventory flooring status from "Consignment from Jane" to "Not designated".');
});

test('change sentences preserve unattributed history and known actor IDs without inventing a user', () => {
  const change = { event_type: 'flooring_changed' as const, before_designation: null, after_designation: null, actor_name: null, actor_id: null, source: 'audit_log' as const };
  assert.equal(inventoryHistoryDescription(change), 'The inventory flooring status changed from "Not designated" to "Not designated". The actor was not recorded.');
  assert.equal(inventoryHistoryDescription({ ...change, source: 'server' }), 'The inventory flooring status changed from "Not designated" to "Not designated". No signed-in user was recorded.');
  assert.equal(inventoryHistoryDescription({ ...change, actor_name: ' ', actor_id: 'known-actor' }), 'User known-actor changed the inventory flooring status from "Not designated" to "Not designated".');
});
