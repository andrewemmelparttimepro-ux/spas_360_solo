import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_INVENTORY_BRANDS, inventoryBrandOptions, inventoryMatchesBrand } from '../src/lib/inventoryBrandFilter.ts';

describe('Inventory brand filter', () => {
  const items = [
    { brand: 'Master Spas' },
    { brand: 'Sundance Spas' },
    { brand: 'Eco Spas' },
    { brand: 'Platinum Spas' },
    { brand: 'Hot Spring' },
    { brand: 'Finnleo' },
    { brand: ' Covana ' },
    { brand: 'Visscher' },
    { brand: 'Hot Spring' },
    { brand: '   ' },
    { brand: null },
  ];

  it('returns every distinct nonblank brand from the loaded inventory in deterministic order', () => {
    assert.deepEqual(inventoryBrandOptions(items), [
      'Covana',
      'Eco Spas',
      'Finnleo',
      'Hot Spring',
      'Master Spas',
      'Platinum Spas',
      'Sundance Spas',
      'Visscher',
    ]);
  });

  it('preserves All Brands and matches using the same trimming as the options', () => {
    assert.equal(inventoryMatchesBrand({ brand: ' Covana ' }, 'Covana'), true);
    assert.equal(inventoryMatchesBrand({ brand: 'Master Spas' }, 'Covana'), false);
    assert.equal(inventoryMatchesBrand({ brand: null }, ALL_INVENTORY_BRANDS), true);
  });
});
