import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const source = await readFile(new URL('../src/components/InventoryEditor.tsx', import.meta.url), 'utf8');

describe('Add Item editor contract', () => {
  it('offers Brandon’s exact alphabetical brand choices', () => {
    const brandBlock = source.match(/const BRANDS = \[([\s\S]*?)\] as const;/)?.[1];
    assert.ok(brandBlock, 'brand choices should be declared as a fixed list');

    const brands = [...brandBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
    assert.deepEqual(brands, [
      'Ashley Furniture',
      'Eco Spas',
      'Finnleo Saunas',
      'FinnSaunas',
      'GDI Saunas',
      'Lux Craft',
      'Master Spas',
      'Other',
      'Platinum Spas',
      'Sundance',
      'Visscher',
    ]);
    assert.doesNotMatch(source, /Other brand/);
  });

  it('keeps one required Model and removes the requested fields from the form', () => {
    assert.equal([...source.matchAll(/>Model(?: \*)?<\/label>/g)].length, 1);
    assert.match(source, />Model \*<\/label>/);
    assert.doesNotMatch(source, />Category<\/label>/);
    assert.doesNotMatch(source, />Store<\/label>/);
    assert.doesNotMatch(source, />Pricing<\/label>/);
    assert.doesNotMatch(source, /placeholder="(?:Cost|MSRP|Sale) \$"/);
    assert.doesNotMatch(source, />Warranty<\/label>/);
    assert.doesNotMatch(source, /5yr shell \/ 2yr parts/);
  });

  it('labels the selector as Location and renders the Minot dealership name', () => {
    assert.match(source, />Location<\/label>/);
    assert.match(source, /return 'Minot - MCHL'/);
    assert.match(source, /locationLabel\(l\.name\)/);
  });

  it('retains required persistence defaults while the removed fields stay hidden', () => {
    assert.match(source, /category: item\?\.category \?\? 'Hot Tubs'/);
    assert.match(source, /location_id: item\?\.location_id \?\? activeLocationId \?\? profile\?\.location_id \?\? locations\[0\]\?\.id \?\? ''/);
    assert.match(source, /category: v\.category/);
    assert.match(source, /model: v\.model\.trim\(\) \|\| null/);
    assert.match(source, /warranty_info: v\.warranty_info\.trim\(\) \|\| null/);
  });
});
