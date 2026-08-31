import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  INVENTORY_STATIONARY_CHOICES,
  INVENTORY_STOCK_STATES,
  inventoryCustomerStockUpdate,
  inventoryCustomerOrStock,
  inventoryStockState,
  joinSerialAndFlooring,
  operationalStatusForNewStockState,
  serialNumberForDisplay,
  splitSerialAndFlooring,
  updateInventoryCustomerOrStock,
} from '../src/lib/inventoryFields.ts';

describe('inventory serial and flooring fields', () => {
  it('renders real serial numbers unchanged', () => {
    assert.equal(serialNumberForDisplay('101039194'), '101039194');
    assert.equal(serialNumberForDisplay('W338867'), 'W338867');
  });

  it('uses the empty display value for order references and pending serial placeholders', () => {
    const placeholders = [
      'Order 4326333',
      'Order # W338867',
      'Order ID 346746 ordered 6/25/26',
      'Pending',
      'Serial Pending',
      'TBD',
      'N/A',
    ];

    for (const placeholder of placeholders) {
      assert.equal(serialNumberForDisplay(placeholder), '', placeholder);
    }
  });

  it('keeps flooring in its own field for composite and flooring-only values', () => {
    assert.deepEqual(
      splitSerialAndFlooring('101039194 "Wells Fargo"'),
      { serial: '101039194', flooring: 'Wells Fargo' },
    );
    assert.deepEqual(
      splitSerialAndFlooring('Order 4326333 Wells Fargo'),
      { serial: 'Order 4326333', flooring: 'Wells Fargo' },
    );
    assert.deepEqual(
      splitSerialAndFlooring('Consignment from Jane Doe'),
      { serial: '', flooring: 'Consignment from Jane Doe' },
    );
  });

  it('preserves the stored order reference when only flooring is edited', () => {
    const stored = 'Order ID 346746 ordered 6/25/26 "Wells Fargo"';
    const parsed = splitSerialAndFlooring(stored);

    assert.equal(serialNumberForDisplay(parsed.serial), '');
    assert.equal(
      joinSerialAndFlooring(parsed.serial, 'Consignment'),
      'Order ID 346746 ordered 6/25/26 "Consignment"',
    );
  });

  it('allows an intentional serial edit to replace the order reference', () => {
    const parsed = splitSerialAndFlooring('Order 4326333 "Wells Fargo"');

    assert.equal(
      joinSerialAndFlooring('101039194', parsed.flooring),
      '101039194 "Wells Fargo"',
    );
  });
});

describe('inventory customer or stock field', () => {
  it('persists each stationary choice as a distinct unassigned value', () => {
    assert.deepEqual(INVENTORY_STATIONARY_CHOICES, ['Stock', 'Need To Order', 'On Order']);

    const updates = INVENTORY_STATIONARY_CHOICES.map(value =>
      inventoryCustomerStockUpdate('Import metadata · Customer: Jane Doe · Keep me', {
        kind: 'stationary',
        value,
      }),
    );

    assert.deepEqual(updates, [
      { customer_id: null, notes: 'Import metadata · Customer: STOCK · Keep me' },
      { customer_id: null, notes: 'Import metadata · Customer: Need To Order · Keep me' },
      { customer_id: null, notes: 'Import metadata · Customer: On Order · Keep me' },
    ]);
    assert.deepEqual(
      updates.map(update => inventoryCustomerOrStock(update.notes, update.customer_id)),
      ['Stock', 'Need To Order', 'On Order'],
    );
  });

  it('keeps real customer assignments linked to the chosen current customer', () => {
    assert.deepEqual(
      inventoryCustomerStockUpdate('Customer: STOCK · Keep me', {
        kind: 'customer',
        customerId: 'customer-123',
        customerName: ' Brandon Solem ',
      }),
      { customer_id: 'customer-123', notes: 'Customer: Brandon Solem · Keep me' },
    );
  });

  it('unassigns only the customer fields and preserves unrelated note segments', () => {
    assert.deepEqual(
      inventoryCustomerStockUpdate(
        'Flooring: Wells Fargo · Customer: Brandon Solem · Ordered: 8/30/2026',
        { kind: 'stationary', value: 'Stock' },
      ),
      {
        customer_id: null,
        notes: 'Flooring: Wells Fargo · Customer: STOCK · Ordered: 8/30/2026',
      },
    );
  });

  it('renders the imported customer value and normalizes the Stock label', () => {
    assert.equal(inventoryCustomerOrStock('Import metadata · Customer: Jane Doe · Need to order: No', null), 'Jane Doe');
    assert.equal(inventoryCustomerOrStock('Import metadata · Customer: STOCK', null), 'Stock');
  });

  it('uses a sensible fallback when imported notes have no Customer segment', () => {
    assert.equal(inventoryCustomerOrStock('Manual inventory note', 'customer-id'), 'Customer');
    assert.equal(inventoryCustomerOrStock('Manual inventory note', null), 'Stock');
  });

  it('prefers the current linked customer over stale imported note text', () => {
    assert.equal(
      inventoryCustomerOrStock('Customer: Previous Owner', 'customer-id', 'Current Owner'),
      'Current Owner',
    );
  });

  it('edits only the Customer segment and preserves all unrelated notes', () => {
    assert.equal(
      updateInventoryCustomerOrStock(
        '[FIXIT_IMPORT sheet="Minot Inventory" row=94] · Customer: Jane Doe · Need to order: Yes',
        'Brandon Solem',
      ),
      '[FIXIT_IMPORT sheet="Minot Inventory" row=94] · Customer: Brandon Solem · Need to order: Yes',
    );
  });

  it('appends a Customer segment when absent and treats a blank edit as Stock', () => {
    assert.equal(
      updateInventoryCustomerOrStock('Manual inventory note', 'Jane Doe'),
      'Manual inventory note · Customer: Jane Doe',
    );
    assert.equal(updateInventoryCustomerOrStock(null, ''), 'Customer: STOCK');
    assert.equal(
      updateInventoryCustomerOrStock('Customer:  · Manual inventory note', ''),
      'Customer:  STOCK · Manual inventory note',
    );
  });
});

describe('inventory stock state', () => {
  it('uses the exact requested choices and prefers the additive stored field', () => {
    assert.deepEqual(INVENTORY_STOCK_STATES, ['Need To Order', 'On Order', 'Stock']);
    assert.equal(inventoryStockState('On Order', 'Customer: STOCK', 'In Stock'), 'On Order');
  });

  it('uses legacy notes and operational status only as a no-rewrite fallback', () => {
    assert.equal(inventoryStockState(null, 'Customer: Need To Order', 'In Stock'), 'Need To Order');
    assert.equal(inventoryStockState(null, 'Group: Need to Order', 'In Stock'), 'Need To Order');
    assert.equal(inventoryStockState(null, 'Customer: Jane Doe', 'On Order'), 'On Order');
    assert.equal(inventoryStockState(null, 'Customer: Jane Doe', 'Sold'), 'Stock');
  });

  it('maps new procurement choices to safe operational availability defaults', () => {
    assert.equal(operationalStatusForNewStockState('Stock'), 'In Stock');
    assert.equal(operationalStatusForNewStockState('On Order'), 'On Order');
    assert.equal(operationalStatusForNewStockState('Need To Order'), 'On Order');
  });
});
