import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('customer New Deal uses one free-text interest field and preserves the deal storage shape', async () => {
  const modal = await read('src/components/QuickDealModal.tsx');

  assert.match(modal, /<label htmlFor="deal-interest"[^>]*>[\s\S]*What are they shopping for\?/);
  assert.match(modal, /<input[\s\S]*id="deal-interest"[\s\S]*value=\{interest\}[\s\S]*setInterest\(e\.target\.value\)/);
  assert.match(modal, /product_interest:\s*interest\.trim\(\)\s*\?\s*\[interest\.trim\(\)\]\s*:\s*null/);
  assert.match(modal, /setTitle\(trimmedInterest \? `\$\{contact\.last_name\} – \$\{trimmedInterest\}` : ''\)/);
  assert.doesNotMatch(modal, /INTERESTS\.map|toggleInterest/);
});
