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
    assert.match(inventory, /setDraft\(submittedValue\);\s*if \(submittedValue === String\(value \?\? ''\)\)/);
    assert.match(inventory, /const parsed = type === 'number' \? \(submittedValue \? parseFloat\(submittedValue\) : null\) : submittedValue;/);
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
});
