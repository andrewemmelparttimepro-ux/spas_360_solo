import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  effectiveInventoryCustomer,
  isAvailableInventoryStock,
  mergeInventoryDealAssignments,
} from '../src/lib/inventoryDealAssignment.ts';
import { inventoryCustomerOrStock } from '../src/lib/inventoryFields.ts';
import type { InventoryItem } from '../src/types/database.ts';

const inventory = (id: string, sku: string): InventoryItem & { customer: null } => ({
  id,
  org_id: 'org-1',
  location_id: 'bismarck',
  sku,
  product: 'Sundance Spas - Nova 7',
  brand: 'Sundance',
  category: 'Hot Tubs',
  model: 'Nova 7',
  color_finish: 'Brown/Platinum',
  status: 'In Stock',
  stock_state: null,
  order_date: null,
  cost: null,
  msrp: null,
  sale_price: null,
  customer_id: null,
  deal_id: null,
  job_id: null,
  date_received: null,
  date_sold: null,
  date_delivered: null,
  warranty_info: null,
  primary_image_storage_path: null,
  primary_image_mime_type: null,
  notes: 'Flooring: Wells Fargo',
  created_at: '2026-08-26T00:00:00Z',
  updated_at: '2026-08-26T00:00:00Z',
  customer: null,
});

describe('inventory deal assignment display', () => {
  it('shows Andrew Q Emmel for serial 101050115 as soon as Deal Detail reserves it', () => {
    const [assigned] = mergeInventoryDealAssignments(
      [inventory('nova-7', '101050115')],
      [{
        id: 'emmel-cold-plunge',
        inventory_item_id: 'nova-7',
        contact: {
          id: 'andrew-emmel',
          first_name: 'Andrew Q',
          last_name: 'Emmel',
          phone: '555-0100',
          customer_type: 'Customer',
        },
      }],
    );

    const customer = effectiveInventoryCustomer(assigned);
    assert.equal(
      inventoryCustomerOrStock(
        assigned.notes,
        customer?.id ?? assigned.customer_id,
        customer ? `${customer.first_name} ${customer.last_name}` : null,
      ),
      'Andrew Q Emmel',
    );
    assert.equal(isAvailableInventoryStock(assigned), false);
  });

  it('leaves an unassigned inventory unit labeled and counted as Stock', () => {
    const [unassigned] = mergeInventoryDealAssignments(
      [inventory('open-unit', '101049999')],
      [],
    );

    const customer = effectiveInventoryCustomer(unassigned);
    assert.equal(
      inventoryCustomerOrStock(
        unassigned.notes,
        customer?.id ?? unassigned.customer_id,
        customer ? `${customer.first_name} ${customer.last_name}` : null,
      ),
      'Stock',
    );
    assert.equal(isAvailableInventoryStock(unassigned), true);
  });

  it('refreshes Inventory on deal changes and rejects a zero-row attachment update', async () => {
    const [inventoryHook, dealHook] = await Promise.all([
      readFile(new URL('../src/hooks/useInventory.ts', import.meta.url), 'utf8'),
      readFile(new URL('../src/hooks/usePipeline.ts', import.meta.url), 'utf8'),
    ]);

    assert.match(inventoryHook, /\.from\('deals'\)[\s\S]*inventory_item_id[\s\S]*contact:contact_id/);
    assert.match(inventoryHook, /table: 'deals',[\s\S]*filter: orgFilter,[\s\S]*\}, fetchItems\)/);
    assert.match(dealHook, /\.update\(updates\)[\s\S]*\.select\('id'\)[\s\S]*\.maybeSingle\(\)/);
    assert.match(dealHook, /if \(error \|\| !data\)[\s\S]*No deal row was updated/);
  });
});
