import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { closeDealSaleArgs, inventoryUnitLabel } from '../src/lib/dealInventory.ts';

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
});
