import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { formatDealCreated } from '../src/lib/dealCreated.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Deals created timestamp', () => {
  it('formats valid immutable creation timestamps and handles missing values', () => {
    assert.match(formatDealCreated('2026-08-31T01:29:09.814442Z'), /2026/);
    assert.notEqual(formatDealCreated('2026-08-31T01:29:09.814442Z'), '—');
    assert.equal(formatDealCreated(null), '—');
    assert.equal(formatDealCreated('not-a-date'), '—');
  });

  it('puts Deal Created immediately before Expected Close and renders created_at for each row', async () => {
    const deals = await read('src/pages/Deals.tsx');

    assert.match(deals, />Deal Created<[\s\S]*>Expected Close</);
    assert.match(deals, /formatDealCreated\(deal\.created_at\)[\s\S]*deal\.expected_close_date/);
    assert.match(deals, /title=\{deal\.created_at\}/);
    assert.match(deals, /colSpan=\{11\}/);
  });
});
