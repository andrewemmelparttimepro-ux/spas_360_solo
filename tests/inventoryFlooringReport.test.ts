import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  INVENTORY_FLOORING_DESIGNATIONS,
  inventoryFlooringAmountSummary,
  inventoryFlooringDesignation,
  inventoryFlooringOptions,
  inventoryForFlooring,
  inventoryForStore,
  inventorySkuForFlooringDesignation,
  type InventoryFlooringReportItem,
} from '../src/lib/inventoryFlooringReport.ts';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const items: InventoryFlooringReportItem[] = [
  { id: '1', location_id: 'a', sku: '100 "Wells Fargo"', product: 'Spa', brand: 'A', model: 'One', status: 'In Stock', flooring_amount: 10000, notes: null, locations: { name: 'Minot' } },
  { id: '2', location_id: 'b', sku: '200 "MCHL TCCU"', product: 'Spa', brand: 'B', model: 'Two', status: 'On Order', flooring_amount: 20000, notes: null, locations: { name: 'Bismarck' } },
  { id: '3', location_id: 'b', sku: '300 wells fargo', product: 'Spa', brand: 'C', model: 'Three', status: 'Sold', flooring_amount: null, notes: null, locations: { name: 'Bismarck' } },
  { id: '4', location_id: 'a', sku: '400', product: 'Spa', brand: 'D', model: 'Four', status: 'Delivered', flooring_amount: 5000, notes: 'Imported · Flooring: Spas Etc TCCU · Customer: STOCK', locations: { name: 'Minot' } },
];

describe('Inventory Flooring Status report', () => {
  it('offers exactly the seven approved designations and filters canonicalized legacy values', () => {
    assert.deepEqual(inventoryFlooringOptions(items), [...INVENTORY_FLOORING_DESIGNATIONS]);
    assert.equal(inventoryForFlooring(items, '').length, 4);
    assert.deepEqual(inventoryForFlooring(items, 'Wells Fargo Minot').map(item => item.id), ['1']);
    assert.deepEqual(inventoryForFlooring(items, 'Wells Fargo Bismarck').map(item => item.id), ['3']);
    assert.equal(inventoryFlooringDesignation({ ...items[0], sku: '100 "Consignement Spa"' }), 'Consignment Spa');
    assert.equal(inventoryFlooringDesignation({ ...items[0], sku: '100 "MCHL"' }), 'Owned by MCHL');
    assert.equal(inventoryFlooringDesignation({ ...items[0], sku: '100 "Owned By Spas etc"' }), 'Owned by Spas Etc');
  });

  it('filters rows by store without changing the source inventory and restores all stores', () => {
    assert.deepEqual(inventoryForStore(items, 'Minot').map(item => item.id), ['1', '4']);
    assert.deepEqual(inventoryForStore(items, 'Bismarck').map(item => item.id), ['2', '3']);
    assert.deepEqual(inventoryForStore(items, ''), items);
  });

  it('changes only the flooring segment while preserving the serial and rejects invalid values', () => {
    assert.equal(inventorySkuForFlooringDesignation('101039194 "Wells Fargo"', 'Owned by MCHL'), '101039194 "Owned by MCHL"');
    assert.equal(inventorySkuForFlooringDesignation('Order 4326333', 'Spas Etc TCCU'), 'Order 4326333 "Spas Etc TCCU"');
    assert.throws(() => inventorySkuForFlooringDesignation('101039194', 'Consignment'), /valid flooring status/);
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
    assert.match(component, /Store[\s\S]*All Stores[\s\S]*Minot[\s\S]*Bismarck/);
    assert.match(component, /Flooring designation[\s\S]*All flooring designations/);
    assert.match(component, /Flooring status for/);
    assert.match(component, />Amount<[\s\S]*total Amount/);
    assert.match(hook, /update\(\{ flooring_amount: flooringAmount \}\)/);
    assert.match(hook, /update\(\{ sku \}\)[\s\S]*\.eq\('id', item\.id\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*\.eq\('sku', item\.sku\)/);
    assert.doesNotMatch(hook, /cost|msrp|sale_price/);
    assert.match(migration, /add column if not exists flooring_amount numeric\(12, 2\)/);
    assert.match(migration, /Only an owner can change an inventory flooring amount/);
  });
});
