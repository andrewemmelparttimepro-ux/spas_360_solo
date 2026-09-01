import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ALL_INVENTORY_BRANDS, INVENTORY_GROUP_FILTERS, inventoryBrandOptions, inventoryMatchesBrand } from '../src/lib/inventoryBrandFilter.ts';

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
    { brand: 'Pools' },
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
      ...INVENTORY_GROUP_FILTERS,
    ]);
    assert.equal(inventoryBrandOptions(items).filter(option => option === 'Pools').length, 1);
  });

  it('preserves All Brands and matches using the same trimming as the options', () => {
    assert.equal(inventoryMatchesBrand({ brand: ' Covana ' }, 'Covana'), true);
    assert.equal(inventoryMatchesBrand({ brand: 'Master Spas' }, 'Covana'), false);
    assert.equal(inventoryMatchesBrand({ brand: null }, ALL_INVENTORY_BRANDS), true);
  });

  it('adds the exact requested inventory groups and applies their production meanings', () => {
    const groupedItems = [
      { brand: null, category: 'Saunas', status: 'In Stock' },
      { brand: null, category: 'Outdoor Living', status: 'In Stock' },
      { brand: null, category: 'Pools', status: 'In Stock' },
      { brand: null, category: 'Covers', status: 'In Stock' },
      { brand: 'Master Spas', category: 'Hot Tubs', status: 'On Order' },
      { brand: null, category: 'Used Spas', status: 'In Stock' },
      { brand: null, category: 'Hot Tubs', status: 'In Stock' },
    ];

    assert.equal(inventoryMatchesBrand(groupedItems[0], 'Saunas'), true);
    assert.equal(inventoryMatchesBrand(groupedItems[1], 'Outdoor Living'), true);
    assert.equal(inventoryMatchesBrand(groupedItems[2], 'Pools'), true);
    assert.equal(inventoryMatchesBrand(groupedItems[3], 'Covers'), true);
    assert.equal(inventoryMatchesBrand(groupedItems[4], 'Need To Order'), true);
    assert.equal(inventoryMatchesBrand(groupedItems[5], 'Used Inventory'), true);
    assert.equal(inventoryMatchesBrand(groupedItems[6], 'All Other'), true);
  });
});
