import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  joinSerialAndFlooring,
  serialNumberForDisplay,
  splitSerialAndFlooring,
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
