import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  inventoryFlooringCostTotal,
  inventoryFlooringCostSummary,
  inventoryFlooringOptions,
  inventoryForFlooring,
  type InventoryFlooringReportItem,
} from '../src/lib/inventoryFlooringReport.ts';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const items: InventoryFlooringReportItem[] = [
  { id: '1', location_id: 'a', sku: '100 "Wells Fargo"', product: 'Spa', brand: 'A', model: 'One', status: 'In Stock', cost: 10000, notes: null },
  { id: '2', location_id: 'b', sku: '200 "MCHL TCCU"', product: 'Spa', brand: 'B', model: 'Two', status: 'On Order', cost: 20000, notes: null },
  { id: '3', location_id: 'b', sku: '300 wells fargo', product: 'Spa', brand: 'C', model: 'Three', status: 'Sold', cost: null, notes: null },
  { id: '4', location_id: 'a', sku: '400', product: 'Spa', brand: 'D', model: 'Four', status: 'Delivered', cost: 5000, notes: 'Imported · Flooring: Spas Etc TCCU · Customer: STOCK' },
];

describe('Inventory Flooring Status report', () => {
  it('builds actual designation options and filters without dropping unassigned inventory by default', () => {
    assert.deepEqual(inventoryFlooringOptions(items), ['MCHL TCCU', 'Spas Etc TCCU', 'Wells Fargo']);
    assert.equal(inventoryForFlooring(items, '').length, 4);
    assert.deepEqual(inventoryForFlooring(items, 'WELLS FARGO').map(item => item.id), ['1', '3']);
  });

  it('totals inventory cost for only the filtered rows', () => {
    assert.equal(inventoryFlooringCostTotal(items), 35000);
    assert.equal(inventoryFlooringCostTotal(inventoryForFlooring(items, 'MCHL TCCU')), 20000);
  });

  it('keeps missing costs distinct from a real zero-dollar value', () => {
    assert.deepEqual(inventoryFlooringCostSummary(items), {
      total: 35000,
      recordedCount: 3,
      missingCount: 1,
    });
    assert.deepEqual(inventoryFlooringCostSummary([{ ...items[0], cost: 0 }]), {
      total: 0,
      recordedCount: 1,
      missingCount: 0,
    });
  });

  it('is owner-scoped, organization-wide, and placed immediately above Paid Commissions', async () => {
    const [page, hook, component] = await Promise.all([
      read('src/pages/OwnersCorner.tsx'),
      read('src/hooks/useInventoryFlooringReport.ts'),
      read('src/components/InventoryFlooringStatusReport.tsx'),
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
    assert.match(component, /Inventory cost[\s\S]*total cost/);
  });
});
