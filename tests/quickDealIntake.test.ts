import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEAL_SHOPPING_OPTIONS, dealShoppingInterests } from '../src/lib/quickDealIntake.ts';

test('shopping categories preserve multiple selections and optional detail in the existing array column', () => {
  assert.deepEqual(DEAL_SHOPPING_OPTIONS, ['Hot Tubs', 'Swim Spas', 'Saunas', 'Game Room', 'Pools', 'Patio Furniture', 'Gazebo', 'Massage Chair', 'Other']);
  assert.deepEqual(dealShoppingInterests(['Hot Tubs', 'Saunas'], '  Sundance Aspen  '), ['Hot Tubs', 'Saunas', 'Sundance Aspen']);
  assert.deepEqual(dealShoppingInterests([], 'Replacement cover'), ['Replacement cover']);
  assert.deepEqual(dealShoppingInterests(['Hot Tubs'], 'Hot Tubs'), ['Hot Tubs']);
  assert.equal(dealShoppingInterests([], '  '), null);
});
