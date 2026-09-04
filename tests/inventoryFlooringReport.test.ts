import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  inventoryFlooringAmountSummary,
  inventoryFlooringOptions,
  inventoryForFlooring,
  type InventoryFlooringReportItem,
} from '../src/lib/inventoryFlooringReport.ts';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const items: InventoryFlooringReportItem[] = [
  { id: '1', location_id: 'a', sku: '100 "Wells Fargo"', product: 'Spa', brand: 'A', model: 'One', status: 'In Stock', flooring_amount: 10000, notes: null },
  { id: '2', location_id: 'b', sku: '200 "MCHL TCCU"', product: 'Spa', brand: 'B', model: 'Two', status: 'On Order', flooring_amount: 20000, notes: null },
  { id: '3', location_id: 'b', sku: '300 wells fargo', product: 'Spa', brand: 'C', model: 'Three', status: 'Sold', flooring_amount: null, notes: null },
  { id: '4', location_id: 'a', sku: '400', product: 'Spa', brand: 'D', model: 'Four', status: 'Delivered', flooring_amount: 5000, notes: 'Imported · Flooring: Spas Etc TCCU · Customer: STOCK' },
];

describe('Inventory Flooring Status report', () => {
  it('builds actual designation options and filters without dropping unassigned inventory by default', () => {
    assert.deepEqual(inventoryFlooringOptions(items), ['MCHL TCCU', 'Spas Etc TCCU', 'Wells Fargo']);
    assert.equal(inventoryForFlooring(items, '').length, 4);
    assert.deepEqual(inventoryForFlooring(items, 'WELLS FARGO').map(item => item.id), ['1', '3']);
  });

  it('totals only the dedicated flooring amount for the filtered rows', () => {
    assert.deepEqual(inventoryFlooringAmountSummary(inventoryForFlooring(items, 'MCHL TCCU')), {
      total: 20000,
      recordedCount: 1,
      missingCount: 0,
    });
  });

  it('keeps blank amounts distinct from a real zero-dollar value', () => {
    assert.deepEqual(inventoryFlooringAmountSummary(items), {
      total: 35000,
      recordedCount: 3,
      missingCount: 1,
    });
    assert.deepEqual(inventoryFlooringAmountSummary([{ ...items[0], flooring_amount: 0 }]), {
      total: 0,
      recordedCount: 1,
      missingCount: 0,
    });
  });

  it('is owner-scoped, organization-wide, and placed immediately above Paid Commissions', async () => {
    const [page, hook, component, migration] = await Promise.all([
      read('src/pages/OwnersCorner.tsx'),
      read('src/hooks/useInventoryFlooringReport.ts'),
      read('src/components/InventoryFlooringStatusReport.tsx'),
      read('supabase/migrations/20260904073000_add_inventory_flooring_amount.sql'),
    ]);
    const flooringReport = page.indexOf('<InventoryFlooringStatusReport />');
    const paidCommissions = page.indexOf('<PaidCommissionsTracker />');

    assert.ok(flooringReport > -1 && paidCommissions > flooringReport);
    assert.match(hook, /profile\.role !== 'owner_manager'/);
    assert.match(hook, /\.eq\('org_id', profile\.org_id\)/);
    assert.doesNotMatch(hook, /activeLocationId|\.eq\('location_id'/);
    assert.match(hook, /\.is\('removed_at', null\)/);
    assert.match(hook, /\.range\(from, from \+ PAGE_SIZE - 1\)/);
    assert.match(component, /Flooring designation[\s\S]*All flooring designations/);
    assert.match(component, />Amount<[\s\S]*total Amount/);
    assert.match(hook, /update\(\{ flooring_amount: flooringAmount \}\)/);
    assert.doesNotMatch(hook, /cost|msrp|sale_price/);
    assert.match(migration, /add column if not exists flooring_amount numeric\(12, 2\)/);
    assert.match(migration, /Only an owner can change an inventory flooring amount/);
  });
});
