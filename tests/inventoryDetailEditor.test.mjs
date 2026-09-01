import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = await readFile(new URL('../src/pages/InventoryDetail.tsx', import.meta.url), 'utf8');

describe('Inventory detail editor', () => {
  it('edits Brand using the shared requested choices and does not expose Category', () => {
    assert.match(source, /import \{ INVENTORY_BRAND_CHOICES \} from '@\/lib\/inventoryBrandFilter';/);
    assert.match(source, /label="Brand"[\s\S]*field="brand"[\s\S]*type="select"[\s\S]*options=\{brandOptions\}/);
    assert.match(source, /item\.brand && !INVENTORY_BRAND_CHOICES\.some/);
    assert.match(source, /\? \[item\.brand, \.\.\.INVENTORY_BRAND_CHOICES\]/);
    assert.doesNotMatch(source, /label="Category"/);
    assert.doesNotMatch(source, /CATEGORY_OPTIONS/);
  });
});
