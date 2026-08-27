import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { availableDealInventory, closeDealSaleArgs, dealInventoryForDisplay, inventoryUnitLabel } from '../src/lib/dealInventory.ts';

const assignedUnit = {
  id: 'unit-1',
  sku: '101049590',
  product: 'Hot tub',
  brand: 'Nova',
  model: 'Nova 7',
  color_finish: null,
  location_id: 'store-1',
  locations: null,
};

describe('deal inventory close flow', () => {
  it('labels a stocked unit with its exact serial and store', () => {
    assert.equal(inventoryUnitLabel({
      id: 'unit-1',
      sku: 'W338867',
      product: 'Hot tub',
      brand: 'Caldera',
      model: 'Geneva',
      color_finish: 'Pearl',
      location_id: 'store-1',
      locations: { name: 'East Bethel' },
    }), 'Caldera · Geneva · Pearl · Serial W338867 · East Bethel');
  });

  it('requires an exact stock unit for inventory fulfillment', () => {
    assert.throws(() => closeDealSaleArgs({
      dealId: 'deal-1',
      stageId: 'won-1',
      fulfillmentType: 'inventory',
      inventoryItemId: '',
    }), /Choose the purchased inventory unit/);
  });

  it('keeps the current deal selection while hiding units reserved by another deal', () => {
    const otherUnit = { ...assignedUnit, id: 'unit-2', sku: 'OTHER-2' };
    const openUnit = { ...assignedUnit, id: 'unit-3', sku: 'OPEN-3' };

    assert.deepEqual(availableDealInventory(
      [assignedUnit, otherUnit, openUnit],
      [
        { id: 'deal-1', inventory_item_id: assignedUnit.id },
        { id: 'deal-2', inventory_item_id: otherUnit.id },
      ],
      'deal-1',
      assignedUnit.id,
    ), [assignedUnit, openUnit]);
  });

  it('shows customer-assigned inventory when a deal has no explicit fulfillment link', () => {
    assert.deepEqual(dealInventoryForDisplay({
      fulfillmentType: null,
      linkedInventory: null,
      customerInventory: [assignedUnit],
    }), { kind: 'inventory', source: 'customer', items: [assignedUnit] });
  });

  it('keeps explicit deal inventory ahead of customer-assigned fallback units', () => {
    const explicitlyLinked = { ...assignedUnit, id: 'explicit-unit', sku: 'EXPLICIT-1' };
    assert.deepEqual(dealInventoryForDisplay({
      fulfillmentType: 'inventory',
      linkedInventory: explicitlyLinked,
      customerInventory: [assignedUnit],
    }), { kind: 'inventory', source: 'deal', items: [explicitlyLinked] });
  });

  it('keeps special orders ahead of unrelated customer-assigned inventory', () => {
    assert.deepEqual(dealInventoryForDisplay({
      fulfillmentType: 'special_order',
      linkedInventory: null,
      customerInventory: [assignedUnit],
    }), { kind: 'special_order', items: [] });
  });

  it('reads unlinked inventory assigned to the deal contact without mutating either row', async () => {
    const [dealHook, dealDetail] = await Promise.all([
      readFile(new URL('../src/hooks/usePipeline.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/pages/DealDetail.tsx', import.meta.url), 'utf8'),
    ]);

    assert.match(dealHook, /\.eq\('customer_id', data\.contact_id\)[\s\S]*\.is\('deal_id', null\)/);
    assert.doesNotMatch(dealHook, /inventory_items'[\s\S]{0,200}\.update\(/);
    assert.match(dealDetail, /source === 'customer'[\s\S]*\? 'Assigned inventory'/);
  });

  it('never sends an inventory id for a special order', () => {
    assert.deepEqual(closeDealSaleArgs({
      dealId: 'deal-1',
      stageId: 'won-1',
      fulfillmentType: 'special_order',
      inventoryItemId: 'stale-ui-selection',
    }), {
      p_deal_id: 'deal-1',
      p_stage_id: 'won-1',
      p_fulfillment_type: 'special_order',
      p_inventory_item_id: null,
    });
  });

  it('serializes and atomically links the deal contact to only an available unit', async () => {
    const [sql, dealsPage, dealDetail, securityMigration] = await Promise.all([
      readFile(new URL('../supabase/migrations/20260825182456_close_deal_inventory_selection.sql', import.meta.url), 'utf8'),
      readFile(new URL('../src/pages/Deals.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/pages/DealDetail.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../supabase/migrations/20260814200000_security_performance_observability.sql', import.meta.url), 'utf8'),
    ]);

    assert.match(sql, /from public\.deals d[\s\S]*for update/);
    assert.match(sql, /from public\.inventory_items i[\s\S]*for update/);
    assert.match(sql, /status = 'In Stock' and customer_id is null and deal_id is null/);
    assert.match(sql, /status = 'Sold',[\s\S]*customer_id = v_contact_id,[\s\S]*deal_id = p_deal_id/);
    assert.match(sql, /p_fulfillment_type = 'special_order'[\s\S]*p_inventory_item_id is not null/);
    assert.match(sql, /perform private\.move_deal\(p_deal_id, p_stage_id, 0\)/);
    assert.match(sql, /deals_sale_fulfillment_inventory_check[\s\S]*sale_fulfillment_type is null and inventory_item_id is null[\s\S]*sale_fulfillment_type = 'inventory' and inventory_item_id is not null[\s\S]*sale_fulfillment_type = 'special_order' and inventory_item_id is null/);
    assert.match(sql, /create trigger require_deal_won_fulfillment[\s\S]*before update of stage_id, sale_fulfillment_type, inventory_item_id/);
    assert.doesNotMatch(sql, /if new\.stage_id is distinct from old\.stage_id/);
    assert.match(sql, /new\.sale_fulfillment_type = 'special_order'[\s\S]*select 1[\s\S]*from public\.inventory_items i[\s\S]*where i\.deal_id = new\.id/);
    assert.match(sql, /Choose the purchased inventory unit or Special order from Deal detail/);
    assert.match(dealsPage, /destinationStage\?\.is_won[\s\S]*navigate\(`\/deals\/\$\{result\.draggableId\}`,[\s\S]*openClosedWon: true[\s\S]*source: 'deals-board'/);
    assert.match(dealsPage, /onClick=\{\(\) => wonStage && navigate\(`\/deals\/\$\{deal\.id\}`,[\s\S]*openClosedWon: true[\s\S]*source: 'deals-list'/);
    assert.match(dealDetail, /navigationState\?\.openClosedWon[\s\S]*outcomeStage\(stages, 'won'\)[\s\S]*void openCloseSale\(won\.id\)/);
    assert.match(dealDetail, /handledCloseWonLocationKey\.current === location\.key/);

    // Match the repository's existing private-wrapper pattern: authenticated
    // callers have schema usage, but neither anon nor PUBLIC can execute it.
    assert.match(securityMigration, /revoke all on schema private from public/);
    assert.match(securityMigration, /grant usage on schema private to authenticated, service_role/);
    assert.match(sql, /revoke all on function private\.close_deal_sale\(uuid, uuid, text, uuid\) from public, anon/);
    assert.match(sql, /grant execute on function private\.close_deal_sale\(uuid, uuid, text, uuid\) to authenticated, service_role/);
    assert.match(sql, /language sql[\s\S]*security invoker[\s\S]*select private\.close_deal_sale/);
  });

  it('opens the inventory table window from Deal Information before Won', async () => {
    const [dealDetail, selector, inventory, sql] = await Promise.all([
      readFile(new URL('../src/pages/DealDetail.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/components/DealInventorySelector.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../src/pages/Inventory.tsx', import.meta.url), 'utf8'),
      readFile(new URL('../supabase/migrations/20260826213000_preselect_deal_inventory.sql', import.meta.url), 'utf8'),
    ]);

    const leftColumn = dealDetail.slice(
      dealDetail.indexOf('Deal Information'),
      dealDetail.indexOf('lg:col-span-2'),
    );

    assert.match(leftColumn, />Inventory item<\/p>[\s\S]*setInventorySelectorContext\('attach'\)/);
    assert.match(leftColumn, /Choose inventory unit/);
    assert.doesNotMatch(leftColumn, /<select[\s\S]*inventory/);
    assert.match(dealDetail, /attachInventoryToDeal[\s\S]*sale_fulfillment_type: inventoryItemId \? 'inventory' : null[\s\S]*inventory_item_id: inventoryItemId \|\| null/);
    assert.match(dealDetail, /setFulfillmentType\(deal\.sale_fulfillment_type\)[\s\S]*setSelectedInventoryId\(deal\.inventory_item_id \?\? ''\)/);
    assert.match(dealDetail, /isClosedDeal[\s\S]*'Attached inventory'/);

    assert.match(selector, /role="dialog"[\s\S]*The rows and color groups match Inventory/);
    assert.match(selector, /aria-label="Filter by make or brand"/);
    assert.match(selector, /groupInventoryItems\(visibleItems\)/);
    assert.match(selector, /group\.headerClassName[\s\S]*group\.tintClassName/);
    const headerPattern = /<th className=\{(?:INVENTORY_)?HEADER_CELL_CLASS\}>([^<]+)<\/th>/g;
    const selectorHeaders = Array.from(selector.matchAll(headerPattern), match => match[1]);
    const inventoryHeaders = Array.from(inventory.matchAll(headerPattern), match => match[1]);
    assert.deepEqual(selectorHeaders, inventoryHeaders);
    assert.deepEqual(selectorHeaders, [
      'Model',
      'Store',
      'Color Combination',
      'Serial Number',
      'Inventory Flooring Status',
      'Inventory Age',
      'Customer/Stock',
      'Delivery Date',
      'On Hand Y/N',
    ]);
    assert.match(selector, /splitSerialAndFlooring\(item\.sku\)[\s\S]*serialNumberForDisplay\(serialAndFlooring\.serial\)/);
    assert.match(selector, /inventoryAgeLabel\(item\.created_at \?\? ''\)/);
    assert.match(selector, /inventoryCustomerOrStock\(item\.notes \?\? null, item\.customer_id \?\? null, currentCustomerName\)/);
    assert.match(selector, /showStore[\s\S]*title=\{item\.locations\?\.name \?\? undefined\}[\s\S]*\.split\(' \('\)\[0\]/);
    assert.match(dealDetail, /setInventorySelectorContext\('won'\)[\s\S]*Open inventory window/);

    assert.match(sql, /v_current_stage_is_won and v_existing_type is not null/);
    assert.match(sql, /i\.status = 'In Stock' and i\.customer_id is null and i\.deal_id is null/);
    assert.match(sql, /i\.status = 'Sold' and i\.customer_id = new\.contact_id and i\.deal_id = new\.id/);
    assert.match(sql, /status = 'Sold',[\s\S]*customer_id = v_contact_id,[\s\S]*deal_id = p_deal_id/);
    assert.match(sql, /perform private\.move_deal\(p_deal_id, p_stage_id, 0\)/);
  });
});
