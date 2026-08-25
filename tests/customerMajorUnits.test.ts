import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('customer list exposes purchased unit details before owner and renames lifetime spend', async () => {
  const [customers, cards] = await Promise.all([
    read('src/pages/Customers.tsx'),
    read('src/hooks/useCustomerCards.ts'),
  ]);

  assert.match(customers, /Lifetime Spend[\s\S]*Major Units Purchased[\s\S]*Owner/);
  assert.match(customers, /unit\.make[\s\S]*unit\.model[\s\S]*Serial:\s*\{unit\.serialNumber\}/);
  assert.match(customers, /aria-label="No major units purchased">—/);
  assert.match(cards, /select\('id, customer_id, brand, model, product, sku'\)/);
  assert.match(cards, /serialNumberForDisplay\(splitSerialAndFlooring/);
  assert.match(cards, /equipmentCount: equipAgg\.get\(c\.id\)\?\.length \?\? 0/);
  assert.match(cards, /majorUnits: equipAgg\.get\(c\.id\) \?\? \[\]/);
});
