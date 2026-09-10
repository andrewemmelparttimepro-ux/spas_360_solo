import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inventoryMatchesSearch, loadInventoryPages } from '../src/lib/inventorySearch.ts';
import type { InventoryWithDealAssignment } from '../src/lib/inventoryDealAssignment.ts';

const customer = (first_name: string, last_name: string) => ({ id: first_name, first_name, last_name, phone: null, customer_type: 'Customer' as const });
const unit = {
  sku: '101050115', product: 'Nova 7', category: 'Hot Tubs',
  customer: customer('Faith', 'Anderson'), dealAssignment: null,
} as InventoryWithDealAssignment;

test('matches direct customer first, last and normalized full name alongside existing inventory fields', () => {
  for (const query of ['Faith', 'ANDERSON', '  faith   Anderson ', '101050', 'Nova', 'Hot Tubs', '']) {
    assert.equal(inventoryMatchesSearch(unit, query), true, query);
  }
  assert.equal(inventoryMatchesSearch(unit, 'someone else'), false);
  assert.equal(inventoryMatchesSearch(unit, 'Faith%'), false);
});
test('search follows the displayed deal customer instead of an overridden direct customer', () => {
  const reserved = { ...unit, dealAssignment: { dealId: 'deal', customer: customer('Grace', 'Example') } };
  assert.equal(inventoryMatchesSearch(reserved, 'Grace Example'), true);
  assert.equal(inventoryMatchesSearch(reserved, 'Faith'), false);
  assert.equal(inventoryMatchesSearch({ ...unit, customer: null }, 'Faith'), false);
});
test('includes a customer beyond the first data page', async () => {
  const rows = Array.from({ length: 501 }, (_, i) => i === 500 ? unit : { ...unit, customer: null });
  const ranges: number[][] = [];
  const loaded = await loadInventoryPages(async (from, to) => {
    ranges.push([from, to]);
    return { data: rows.slice(from, to + 1), error: null };
  });
  assert.deepEqual(ranges, [[0, 499], [500, 999]]);
  assert.equal(loaded.filter(row => inventoryMatchesSearch(row, 'Faith')).length, 1);
});
test('a later page failure rejects partial data instead of displaying a false empty search', async () => {
  await assert.rejects(loadInventoryPages(async from => from === 0
    ? { data: [unit], error: null }
    : { data: null, error: new Error('page failed') }, 1), /page failed/);
});
