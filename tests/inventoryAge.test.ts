import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { inventoryAgeInDays, inventoryAgeLabel, inventoryAgeLabelForItem } from '../src/lib/inventoryAge.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('inventory age', () => {
  it('counts dealership-local calendar days from Wednesday to Saturday', () => {
    assert.equal(
      inventoryAgeInDays('2026-08-26T15:00:00Z', new Date('2026-08-29T15:00:00Z')),
      3,
    );
    assert.equal(inventoryAgeLabel('2026-08-26T15:00:00Z', new Date('2026-08-29T15:00:00Z')), '3 days');
  });

  it('counts a local midnight even when less than 24 hours elapsed', () => {
    assert.equal(
      inventoryAgeInDays('2026-08-27T04:30:00Z', new Date('2026-08-27T05:30:00Z')),
      1,
    );
  });

  it('does not lose a calendar day across the spring daylight-saving change', () => {
    assert.equal(
      inventoryAgeInDays('2026-03-07T18:00:00Z', new Date('2026-03-09T17:00:00Z')),
      2,
    );
  });

  it('uses singular and same-day labels and handles invalid or future timestamps safely', () => {
    const today = new Date('2026-08-29T18:00:00Z');
    assert.equal(inventoryAgeLabel('2026-08-28T18:00:00Z', today), '1 day');
    assert.equal(inventoryAgeLabel('2026-08-29T05:01:00Z', today), '0 days');
    assert.equal(inventoryAgeLabel('2026-08-30T18:00:00Z', today), '0 days');
    assert.equal(inventoryAgeLabel('not-a-date', today), '—');
  });

  it('prefers Date Received and falls back to the inventory-entered date', () => {
    const today = new Date('2026-08-29T18:00:00Z');
    assert.equal(inventoryAgeLabelForItem('2026-08-28', '2026-08-20T18:00:00Z', today), '1 day');
    assert.equal(inventoryAgeLabelForItem(null, '2026-08-26T18:00:00Z', today), '3 days');
    assert.equal(inventoryAgeLabelForItem('', '2026-08-26T18:00:00Z', today), '3 days');
    assert.equal(inventoryAgeLabelForItem('2026-08-30', '2026-08-20T18:00:00Z', today), '0 days');
    assert.equal(inventoryAgeLabelForItem('not-a-date', '2026-08-20T18:00:00Z', today), '—');
    assert.equal(inventoryAgeLabelForItem('2026-02-30', '2026-08-20T18:00:00Z', today), '—');
  });

  it('places Inventory Age before the split Customer, Stock, and Order Date columns', async () => {
    const inventory = await read('src/pages/Inventory.tsx');

    assert.match(inventory, /Inventory Flooring Status<\/th>[\s\S]*Inventory Age<\/th>[\s\S]*Customer<\/th>[\s\S]*Stock<\/th>[\s\S]*Order Date<\/th>[\s\S]*Date Received<\/th>/);
    assert.match(inventory, /inventoryAgeLabelForItem\(item\.date_received, item\.created_at\)/);
    assert.match(inventory, /const columnCount = showStore \? 12 : 11;/);
  });
});
