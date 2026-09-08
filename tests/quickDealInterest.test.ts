import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

test('customer New Deal keeps optional shopping text and separate multiline notes below the choices', async () => {
  const modal = await read('src/components/QuickDealModal.tsx');

  assert.match(modal, /<legend[^>]*>[\s\S]*What are they shopping for\?/);
  assert.match(modal, /DEAL_SHOPPING_OPTIONS\.map/);
  assert.match(modal, /aria-pressed=\{active\}/);
  assert.match(modal, /<input[\s\S]*id="deal-interest"[\s\S]*value=\{interest\}[\s\S]*setInterest\(e\.target\.value\)/);
  assert.match(modal, /product_interest:\s*shoppingInterests/);
  assert.match(modal, /<\/fieldset>\s*<div>\s*<label htmlFor="deal-notes"[^>]*>\s*Notes and Details[\s\S]*<textarea[\s\S]*value=\{notes\}/);
  assert.match(modal, /rpc\('create_quick_deal',[\s\S]*p_notes: notes\.trim\(\)/);
  assert.doesNotMatch(modal, /from\('(deals|notes|tasks|notifications)'\)\.insert/);
});

test('customer New Deal shows the requested lead sources and stores the canonical deal value', async () => {
  const [modal, schema] = await Promise.all([
    read('src/components/QuickDealModal.tsx'),
    read('supabase/schema.sql'),
  ]);

  const options = [...modal.matchAll(/\{ label: '([^']+)', storedValue: '([^']+)' \}/g)]
    .map(([, label, storedValue]) => ({ label, storedValue }));

  assert.deepEqual(options, [
    { label: 'Facebook', storedValue: 'Facebook' },
    { label: 'Google', storedValue: 'Google' },
    { label: 'Radio', storedValue: 'Radio' },
    { label: 'Tv', storedValue: 'Tv' },
    { label: 'Website', storedValue: 'Website' },
    { label: 'Referral', storedValue: 'Referral' },
    { label: 'Called In', storedValue: 'Called In' },
    { label: 'Walk-In', storedValue: 'Walk-In' },
    { label: 'Off-Site Show/Event', storedValue: 'Off-Site Show/Event' },
  ]);
  assert.match(modal, /useDraftState<DealLeadSourceChoice>\(draftScope, 'leadSource', 'Walk-In'\)/);
  assert.match(modal, /<label htmlFor="deal-lead-source"[^>]*>[\s\S]*Lead Source[\s\S]*<select[\s\S]*id="deal-lead-source"[\s\S]*required/);
  const leadSourceSelect = modal.match(/<select\b[^>]*id="deal-lead-source"[^>]*>[\s\S]*?<\/select>/)?.[0];
  assert.ok(leadSourceSelect, 'The Lead Source select exists');
  assert.match(leadSourceSelect, /LEAD_SOURCE_OPTIONS\.map\(option =>/);
  assert.doesNotMatch(leadSourceSelect, /<option value=""/);
  assert.match(modal, /lead_source:\s*storedLeadSource/);
  assert.doesNotMatch(modal, /lead_source:\s*contact\.lead_source/);
  for (const value of options.map(option => option.storedValue)) {
    assert.match(schema, new RegExp(`'${value.replace('/', '\\/')}'`));
  }
});

test('Deals New Deal opens the existing-customer form with the requested deal fields', async () => {
  const [deals, modal] = await Promise.all([
    read('src/pages/Deals.tsx'),
    read('src/components/QuickDealModal.tsx'),
  ]);

  assert.match(deals, /onClick=\{\(\) => setQuickDeal\(\{\}\)\}[\s\S]*New Deal/);
  assert.doesNotMatch(deals, /NewCustomerWizard|New Customer/);
  assert.match(modal, /contactId\?: string/);
  assert.match(modal, /Existing Customer \*/);
  assert.match(modal, /aria-label="Search existing customers"/);
  assert.match(modal, /filterCustomersByNamePrefix\(customers, customerSearch\)/);
  assert.match(modal, /\.from\('contacts'\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*\.range\(from, from \+ pageSize - 1\)/);
  assert.match(modal, />Deal Title \*</);
  assert.match(modal, />Stage \*</);
  assert.match(modal, />Deal Owner \*</);
  assert.match(modal, />Set Next Activity Date \*</);
  assert.match(modal, />Projected \$ Amount</);
  assert.match(modal, />Priority</);
  assert.match(modal, />Expected close date \*</);
  assert.match(modal, /assigned_to: creditTo/);
  assert.match(modal, /p_next_activity_date: nextActivityDate/);
  assert.doesNotMatch(modal, /from\('contacts'\)\.insert/);
});
