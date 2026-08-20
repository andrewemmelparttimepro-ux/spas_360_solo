import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { groupInventoryItems, inventoryGroupKey, inventorySourcePosition, type InventoryGroupingItem } from '../src/lib/inventoryGrouping.ts';

const item = (overrides: Partial<InventoryGroupingItem> & Pick<InventoryGroupingItem, 'id'>): InventoryGroupingItem => ({
  brand: null,
  category: 'Hot Tubs',
  notes: null,
  created_at: '2026-08-19T00:00:00Z',
  ...overrides,
});

describe('inventory workbook grouping', () => {
  it('parses stable sheet, row, and unit order from the source marker', () => {
    assert.deepEqual(inventorySourcePosition('[FIXIT_IMPORT request_post=card sha256=hash sheet="Minot Inventory" row=94 unit=2] · Need to order: Yes'), { sheet: 'Minot Inventory', row: 94, unit: 2 });
    assert.deepEqual(inventorySourcePosition('[FIXIT_IMPORT request_post=card sha256=hash sheet=Used Inventory row=15 unit=1] · Group: Used Inventory'), { sheet: 'Used Inventory', row: 15, unit: 1 });
    assert.deepEqual(inventorySourcePosition('[FIXIT_IMPORT source_post=old request_post=old sha256=old sheet="Bismarck Inventory" row=12] · Customer: STOCK'), { sheet: 'Bismarck Inventory', row: 12, unit: 1 });
    assert.equal(inventorySourcePosition('Manual inventory note'), null);
  });

  it('keeps need-to-order and used rows in their workbook sections before brand grouping', () => {
    assert.equal(inventoryGroupKey(item({ id: 'need', brand: 'Master Spas', notes: '· Need to order: Yes' })), 'need_to_order');
    assert.equal(inventoryGroupKey(item({ id: 'need-live', brand: 'Master Spas', notes: '· Group: Need to Order' })), 'need_to_order');
    assert.equal(inventoryGroupKey(item({ id: 'used', brand: 'Sundance Spas', category: 'Used Spas' })), 'used');
    assert.equal(inventoryGroupKey(item({ id: 'brand', brand: 'Eco Spas' })), 'eco');
    assert.equal(inventoryGroupKey(item({ id: 'manual' })), 'other');
  });

  it('sorts groups in workbook order and rows by sheet, row, then unit without mutating input', () => {
    const input = [
      item({ id: 'manual-z', created_at: '2026-08-20T00:00:00Z' }),
      item({ id: 'minot-3', brand: 'Sundance Spas', notes: '[FIXIT_IMPORT sheet="Minot Inventory" row=3 unit=1]' }),
      item({ id: 'need-2', brand: 'Master Spas', notes: '[FIXIT_IMPORT sheet="Minot Inventory" row=94 unit=2] · Need to order: Yes' }),
      item({ id: 'bismarck-4', brand: 'Sundance Spas', notes: '[FIXIT_IMPORT sheet="Bismarck Inventory" row=4 unit=1]' }),
      item({ id: 'need-1', brand: 'Master Spas', notes: '[FIXIT_IMPORT sheet="Minot Inventory" row=94 unit=1] · Need to order: Yes' }),
      item({ id: 'bismarck-2', brand: 'Sundance Spas', notes: '[FIXIT_IMPORT sheet="Bismarck Inventory" row=2 unit=1]' }),
      item({ id: 'used', category: 'Used Spas', notes: '[FIXIT_IMPORT sheet="Used Inventory" row=2 unit=1]' }),
    ];
    const originalOrder = input.map(({ id }) => id);
    const groups = groupInventoryItems(input);
    assert.deepEqual(groups.map(({ key }) => key), ['sundance', 'need_to_order', 'used', 'other']);
    assert.deepEqual(groups[0].items.map(({ id }) => id), ['bismarck-2', 'bismarck-4', 'minot-3']);
    assert.deepEqual(groups[1].items.map(({ id }) => id), ['need-1', 'need-2']);
    assert.deepEqual(input.map(({ id }) => id), originalOrder);
  });
});
