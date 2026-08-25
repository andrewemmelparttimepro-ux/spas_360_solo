import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('inventory table density contract', () => {
  it('keeps compact rows while preserving table structure and edit targets', async () => {
    const inventory = await read('src/pages/Inventory.tsx');

    assert.match(inventory, /const INVENTORY_HEADER_CELL_CLASS = 'px-3 py-2 text-\[11px\]/);
    assert.match(inventory, /const INVENTORY_GROUP_HEADER_CELL_CLASS = 'px-3 py-1 text-left'/);
    assert.match(inventory, /const INVENTORY_ROW_CELL_CLASS = 'px-3 py-0\.5 text-xs leading-4'/);
    assert.match(inventory, /<table data-density="compact"/);
    assert.match(inventory, /sticky top-0 z-10/);
    assert.match(inventory, /groupedItems\.map\(group =>/);
    assert.match(inventory, /min-h-6 cursor-pointer/);
    assert.match(inventory, /inline-flex min-h-6 cursor-pointer/);
    assert.doesNotMatch(inventory, /<td className="px-4 py-2\.5 text-sm/);
  });
});
