import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('inventory inline edit persistence contract', () => {
  it('gives date and select editors explicit Save and Cancel actions', async () => {
    const inventory = await read('src/pages/Inventory.tsx');

    assert.match(inventory, /const requiresExplicitCommit = type === 'date' \|\| type === 'select';/);
    assert.match(inventory, /aria-label=\{`Save \$\{field\}`\}/);
    assert.match(inventory, /aria-label=\{`Cancel \$\{field\}`\}/);
    assert.match(inventory, /onBlur=\{requiresExplicitCommit \? undefined : commit\}/);
  });

  it('awaits persistence and only closes a changed editor after a successful save', async () => {
    const inventory = await read('src/pages/Inventory.tsx');

    assert.match(inventory, /const submittedValue = inputRef\.current\?\.value \?\? draft;/);
    assert.match(inventory, /setDraft\(submittedValue\);\s*if \(!commitWhenUnchanged && submittedValue === String\(value \?\? ''\)\)/);
    assert.match(inventory, /type === 'date'[\s\S]*\? \(submittedValue \|\| null\)/);
    assert.match(inventory, /const saved = await onSave\(itemId, \{ \[field\]: parsed \} as Partial<InventoryItem>\);/);
    assert.match(inventory, /if \(saved\) \{\s*setEditing\(false\);\s*return;\s*\}/);
    assert.match(inventory, /setSaveError\('Could not save\. Try again\.'\);/);
    assert.match(inventory, /\{saveError && <span role="alert"/);
  });

  it('requires the inventory update query to return an updated row', async () => {
    const hook = await read('src/hooks/useInventory.ts');

    assert.match(hook, /\.update\(updates\)\s*\.eq\('id', id\)\s*\.select\('id'\);/);
    assert.match(hook, /if \(error \|\| !data \|\| data\.length === 0\)/);
    assert.match(hook, /return false;/);
  });

  it('searches current customer data and persists the real Customer assignment', async () => {
    const inventory = await read('src/pages/Inventory.tsx');
    const hook = await read('src/hooks/useInventory.ts');

    assert.match(inventory, /function CustomerCell\(/);
    assert.match(inventory, /\.from\('contacts'\)/);
    assert.match(inventory, /\.eq\('org_id', profile\.org_id\)/);
    assert.match(inventory, /filterCustomersByNamePrefix\(\(data \?\? \[\]\) as CustomerChoice\[\], normalized\)/);
    assert.match(inventory, /customerId: customer\.id/);
    assert.match(inventory, /inventoryCustomerStockUpdate\(item\.notes, \{/);
    assert.match(inventory, /state=\{\{ openWizard: true \}\}[\s\S]*Add New Customer/);
    assert.match(inventory, /<CustomerCell item=\{item\} onSave=\{updateItem\} \/>/);
    assert.match(hook, /customer:customer_id\(id, first_name, last_name, phone, customer_type\)/);
  });

  it('keeps a stationary Unassign Customer action outside customer search results', async () => {
    const inventory = await read('src/pages/Inventory.tsx');
    const customerCell = inventory.slice(
      inventory.indexOf('function CustomerCell'),
      inventory.indexOf('type CustomerChoice'),
    );

    assert.match(customerCell, /const saveUnassignment = \(\) => saveCustomerUpdate\([\s\S]*kind: 'stationary',[\s\S]*value: 'Stock'/);
    assert.match(customerCell, /onClick=\{\(\) => void saveUnassignment\(\)\}[\s\S]*Unassign Customer/);
    assert.ok(customerCell.indexOf('Unassign Customer') < customerCell.indexOf('{matches.map'));
    assert.match(customerCell, /hasManagedInventoryAssignment\(item\)/);
    assert.match(customerCell, /title="Managed by a linked deal or job"/);
  });

  it('persists Stock and Order Date independently from operational assignment fields', async () => {
    const inventory = await read('src/pages/Inventory.tsx');

    assert.match(inventory, /function StockStateCell\(/);
    assert.match(inventory, /field="stock_state"[\s\S]*options=\{\[\.\.\.INVENTORY_STOCK_STATES\]\}/);
    assert.match(inventory, /<EditableCell value=\{item\.order_date\} field="order_date"[^>]*type="date" \/>/);
    const stockCell = inventory.slice(inventory.indexOf('function StockStateCell'), inventory.indexOf('function OnHandCell'));
    assert.doesNotMatch(stockCell, /(status|customer_id|deal_id|job_id)\s*:/);
  });

  it('adds nullable constrained columns without rewriting existing inventory rows', async () => {
    const migration = await read('supabase/migrations/20260831004457_add_inventory_stock_state_order_date.sql');

    assert.match(migration, /add column if not exists stock_state text/);
    assert.match(migration, /add column if not exists order_date date/);
    assert.match(migration, /stock_state in \('Need To Order', 'On Order', 'Stock'\)/);
    assert.doesNotMatch(migration, /update public\.inventory_items/);
  });
});
