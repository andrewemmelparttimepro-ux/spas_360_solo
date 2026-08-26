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

test('customer New Deal shows the requested lead sources and stores the canonical deal value', async () => {
  const modal = await read('src/components/QuickDealModal.tsx');

  const options = [...modal.matchAll(/\{ label: '([^']+)', storedValue: '([^']+)' \}/g)]
    .map(([, label, storedValue]) => ({ label, storedValue }));

  assert.deepEqual(options, [
    { label: 'Facebook', storedValue: 'Ad' },
    { label: 'Google', storedValue: 'Ad' },
    { label: 'Radio', storedValue: 'Ad' },
    { label: 'Tv', storedValue: 'Ad' },
    { label: 'Website', storedValue: 'Website' },
    { label: 'Referral', storedValue: 'Referral' },
    { label: 'Called In', storedValue: 'Phone' },
    { label: 'Walk-In', storedValue: 'Walk-in' },
    { label: 'Off-Site Show/Event', storedValue: 'Event' },
  ]);
  assert.match(modal, /useState<DealLeadSourceChoice>\('Walk-In'\)/);
  assert.match(modal, /<label htmlFor="deal-lead-source"[^>]*>[\s\S]*Lead Source[\s\S]*<select[\s\S]*id="deal-lead-source"[\s\S]*required/);
  assert.match(modal, /LEAD_SOURCE_OPTIONS\.map\(option =>/);
  assert.doesNotMatch(modal, /<option value=""/);
  assert.match(modal, /lead_source:\s*storedLeadSource/);
  assert.doesNotMatch(modal, /lead_source:\s*contact\.lead_source/);
});
