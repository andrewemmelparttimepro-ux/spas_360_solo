import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  INVENTORY_FLOORING_DESIGNATIONS,
  INVENTORY_FLOORING_ROW_COLORS,
  canonicalInventoryFlooringStore,
  inventoryFlooringAmountSummary,
  inventoryFlooringDesignation,
  inventoryFlooringOptions,
  inventoryForFlooring,
  inventoryForStore,
  inventoryFlooringRowIsRemoved,
  inventorySkuForFlooringDesignation,
  type InventoryFlooringReportItem,
} from '../src/lib/inventoryFlooringReport.ts';
import {
  INVENTORY_FLOORING_DEFAULT_COLUMN_WIDTHS,
  INVENTORY_FLOORING_DEFAULT_ROW_HEIGHT,
  resizedInventoryFlooringColumnWidth,
  resizedInventoryFlooringRowHeight,
} from '../src/lib/inventoryFlooringGrid.ts';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

const flooringRow = (inventoryItemId: string, removed = false) => ({
  inventory_item_id: inventoryItemId,
  org_id: 'org-a',
  status_text: null,
  background_color: null,
  report_removed_at: removed ? '2026-09-04T12:00:00.000Z' : null,
  version: 1,
  updated_at: '2026-09-04T12:00:00.000Z',
  updated_by: null,
});

const items: InventoryFlooringReportItem[] = [
  { id: '1', location_id: 'a', sku: '100 "Wells Fargo"', product: 'Spa', brand: 'A', model: 'One', status: 'In Stock', flooring_amount: 10000, notes: null, locations: { name: 'Minot' }, flooring_report: flooringRow('1') },
  { id: '2', location_id: 'b', sku: '200 "MCHL TCCU"', product: 'Spa', brand: 'B', model: 'Two', status: 'On Order', flooring_amount: 20000, notes: null, locations: { name: "Bismarck (Spa's Etc)" }, flooring_report: flooringRow('2') },
  { id: '3', location_id: 'b', sku: '300 wells fargo', product: 'Spa', brand: 'C', model: 'Three', status: 'Sold', flooring_amount: null, notes: null, locations: { name: "Bismarck (Spa's Etc)" }, flooring_report: flooringRow('3') },
  { id: '4', location_id: 'a', sku: '400', product: 'Spa', brand: 'D', model: 'Four', status: 'Delivered', flooring_amount: 5000, notes: 'Imported · Flooring: Spas Etc TCCU · Customer: STOCK', locations: { name: 'Minot' }, flooring_report: flooringRow('4') },
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
    assert.equal(canonicalInventoryFlooringStore("Bismarck (Spa's Etc)"), 'Bismarck');
    assert.equal(canonicalInventoryFlooringStore('Minot'), 'Minot');
    assert.equal(canonicalInventoryFlooringStore('North Bismarck warehouse'), '');
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
    assert.deepEqual(
      inventoryFlooringAmountSummary(inventoryForFlooring(inventoryForStore(items, 'Minot'), 'Wells Fargo Minot')),
      { total: 10000, recordedCount: 1, missingCount: 0 },
    );
    assert.deepEqual(
      inventoryFlooringAmountSummary(inventoryForFlooring(inventoryForStore(items, 'Bismarck'), 'Wells Fargo Bismarck')),
      { total: 0, recordedCount: 0, missingCount: 1 },
    );
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

  it('tracks report-only removal independently from inventory and exposes a bounded color palette', () => {
    assert.equal(inventoryFlooringRowIsRemoved(items[0]), false);
    assert.equal(inventoryFlooringRowIsRemoved({ ...items[0], flooring_report: flooringRow('1', true) }), true);
    assert.equal(INVENTORY_FLOORING_ROW_COLORS.length, 6);
    assert.ok(INVENTORY_FLOORING_ROW_COLORS.every(color => /^#[0-9A-F]{6}$/.test(color)));
  });

  it('turns pointer deltas into bounded column widths and row heights', () => {
    assert.equal(resizedInventoryFlooringColumnWidth(180, 40, 1), 220);
    assert.equal(resizedInventoryFlooringColumnWidth(180, -10_000, 1), 88);
    assert.equal(resizedInventoryFlooringColumnWidth(180, 10_000, 1), 480);
    assert.equal(resizedInventoryFlooringRowHeight(INVENTORY_FLOORING_DEFAULT_ROW_HEIGHT, -10_000), 36);
    assert.equal(resizedInventoryFlooringRowHeight(INVENTORY_FLOORING_DEFAULT_ROW_HEIGHT, 10_000), 180);
    assert.throws(() => resizedInventoryFlooringColumnWidth(100, 0, 99), /Unknown inventory flooring column/);
    assert.equal(INVENTORY_FLOORING_DEFAULT_COLUMN_WIDTHS.length, 8);
  });

  it('is owner-scoped, organization-wide, and placed immediately above Paid Commissions', async () => {
    const [page, hook, component, migration, rowControlsMigration] = await Promise.all([
      read('src/pages/OwnersCorner.tsx'),
      read('src/hooks/useInventoryFlooringReport.ts'),
      read('src/components/InventoryFlooringStatusReport.tsx'),
      read('supabase/migrations/20260904073000_add_inventory_flooring_amount.sql'),
      read('supabase/migrations/20260904124500_add_inventory_flooring_row_controls.sql'),
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
    assert.match(component, /aria-label="Filtered inventory flooring amount summary"[\s\S]*Total amount owed[\s\S]*currency\.format\(amountSummary\.total\)[\s\S]*min-h-0 flex-1 overflow-auto/);
    assert.match(component, /selectedStore \|\| 'All Stores'[\s\S]*selectedFlooring \|\| 'All flooring designations'/);
    assert.match(component, /Flooring status for/);
    assert.match(component, />Amount<[\s\S]*total Amount/);
    assert.match(hook, /update\(\{ flooring_amount: flooringAmount \}\)[\s\S]*\.eq\('id', item\.id\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*(?:\.is|\.eq)\('flooring_amount'/);
    assert.match(hook, /update\(\{ sku \}\)[\s\S]*\.eq\('id', item\.id\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*\.eq\('sku', item\.sku\)/);
    assert.doesNotMatch(hook, /cost|msrp|sale_price/);
    assert.match(migration, /add column if not exists flooring_amount numeric\(12, 2\)/);
    assert.match(migration, /Only an owner can change an inventory flooring amount/);
    assert.match(component, /Status \/ customer/);
    assert.match(component, /placeholder="Customer name"/);
    assert.match(component, /Select row \$\{index \+ 1\} for background color/);
    assert.match(component, /Custom row background color/);
    assert.match(component, /Paid off/);
    assert.match(component, /Show paid-off rows/);
    assert.match(component, /data-resizable-grid="inventory-flooring"/);
    assert.match(component, /Drag an amber header edge to resize a column/);
    assert.match(component, /aria-label=\{`Resize \$\{label\} column`\}/);
    assert.match(component, /aria-label=\{`Resize row \$\{index \+ 1\}`\}/);
    assert.match(component, /cursor-col-resize/);
    assert.match(component, /cursor-row-resize/);
    assert.match(component, /Reset sizes/);
    assert.match(component, /<colgroup>[\s\S]*columnWidths\.map/);
    assert.match(component, /selectedStore \|\| 'All Stores'[\s\S]*selectedFlooring \|\| 'All flooring designations'/);
    assert.match(hook, /rpc\('set_inventory_flooring_row_value',[\s\S]*p_inventory_item_id: item\.id[\s\S]*p_expected_version: item\.flooring_report\.version[\s\S]*p_field: field/);
    assert.match(rowControlsMigration, /create table if not exists public\.inventory_flooring_rows/);
    assert.match(rowControlsMigration, /foreign key \(inventory_item_id, org_id\)[\s\S]*references public\.inventory_items\(id, org_id\)/);
    assert.match(rowControlsMigration, /status_text text[\s\S]*background_color text[\s\S]*report_removed_at timestamptz[\s\S]*version bigint/);
    assert.match(rowControlsMigration, /for update to authenticated[\s\S]*org_id = \(select public\.auth_org\(\)\)[\s\S]*auth_role\(\)\) = 'owner_manager'/);
    assert.doesNotMatch(rowControlsMigration, /grant (?:delete|insert|update) (?:\([^)]*\) )?on table public\.inventory_flooring_rows to authenticated/);
    assert.match(rowControlsMigration, /security definer[\s\S]*p_field = 'status_text'[\s\S]*p_field = 'background_color'[\s\S]*p_field = 'report_removed'/);
    assert.match(rowControlsMigration, /org_id = v_org_id[\s\S]*version = p_expected_version/);
    assert.match(rowControlsMigration, /grant execute on function public\.set_inventory_flooring_row_value\(uuid, bigint, text, text\)[\s\S]*to authenticated, service_role/);
    assert.match(rowControlsMigration, /new\.version := old\.version \+ 1/);
    assert.match(rowControlsMigration, /after insert on public\.inventory_items/);
    assert.match(rowControlsMigration, /alter publication supabase_realtime add table public\.inventory_flooring_rows/);
  });
});
