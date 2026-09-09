import assert from 'node:assert/strict';
import test from 'node:test';
import { customerInventoryForDisplay, customerInventoryLabel, type CustomerInventoryItem } from '../src/lib/customerInventory.ts';

const unit = (id: string, overrides: Partial<CustomerInventoryItem> = {}): CustomerInventoryItem => ({
  id, brand: 'Arctic', model: 'Summit', product: 'Hot tub', color_finish: null,
  sku: `SERIAL-${id}`, customer_id: null, job: null, deal: null, reservations: [], ...overrides,
});

test('includes every customer assignment across jobs and deals once, without unrelated stock', () => {
  const owned = unit('owned', { customer_id: 'customer' });
  const job = unit('other-job', { job: { contact_id: 'customer' } });
  const legacyDeal = unit('legacy-deal', { deal: { contact_id: 'customer' } });
  const reserved = unit('reserved', { reservations: [{ contact_id: 'customer' }] });
  const items = customerInventoryForDisplay('customer', [
    [owned, unit('stock'), unit('other-customer', { customer_id: 'other' })],
    [job, owned], [legacyDeal, reserved], [reserved],
  ]);
  assert.deepEqual(new Set(items.map(item => item.id)), new Set(['owned', 'other-job', 'legacy-deal', 'reserved']));
  assert.equal(items.length, 4);
});

test('current deal reservations override direct and historical job/deal ownership', () => {
  const items = customerInventoryForDisplay('customer', [[
    unit('reserved-for-customer', { customer_id: 'other', reservations: [{ contact_id: 'customer' }] }),
    unit('reserved-for-other', { customer_id: 'customer', job: { contact_id: 'customer' }, reservations: [{ contact_id: 'other' }] }),
    unit('owned-by-other', { customer_id: 'other', job: { contact_id: 'customer' } }),
    unit('legacy-deal-other', { job: { contact_id: 'customer' }, deal: { contact_id: 'other' } }),
    unit('conflicting-reservations', { customer_id: 'customer', reservations: [{ contact_id: 'customer' }, { contact_id: 'other' }] }),
  ]]);
  assert.deepEqual(items.map(item => item.id), ['reserved-for-customer']);
});

test('a customer without inventory never inherits the previous customer or store inventory', () => {
  assert.deepEqual(customerInventoryForDisplay('empty-customer', [[unit('other', { customer_id: 'customer' })]]), []);
  assert.deepEqual(customerInventoryForDisplay('empty-customer', [[], [], [], []]), []);
});

test('unit labels show useful identity and real serials without financing and order metadata', () => {
  assert.equal(customerInventoryLabel(unit('1', { color_finish: 'Black', sku: 'ABC123 "Wells Fargo"' })), 'Arctic · Summit · Black · Serial: ABC123');
  assert.equal(customerInventoryLabel(unit('2', { brand: null, model: null, sku: 'Order #123' })), 'Hot tub · Serial: Unknown');
  assert.equal(customerInventoryLabel(unit('3', { sku: 'TBD' })), 'Arctic · Summit · Serial: Unknown');
  assert.equal(customerInventoryLabel(unit('4', { brand: null, model: null, product: '', sku: null })), 'Inventory unit · Serial: Unknown');
});
