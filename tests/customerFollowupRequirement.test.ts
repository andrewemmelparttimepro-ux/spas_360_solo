import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('New Customer required follow-up details', () => {
  it('requires a non-blank follow-up note before creation is enabled', async () => {
    const wizard = await read('src/components/NewCustomerWizard.tsx');

    assert.match(wizard, /const step5Done = followupDate\.length > 0 && firstNote\.trim\(\)\.length > 0;/);
    assert.match(wizard, /const canCreate = step1Done && step2Done && step3Done && step4Done && step5Done && !saving;/);
    assert.match(wizard, /<button[\s\S]*onClick=\{handleCreate\}[\s\S]*disabled=\{!canCreate\}/);
  });

  it('labels the required field exactly and saves its trimmed value', async () => {
    const wizard = await read('src/components/NewCustomerWizard.tsx');

    assert.match(wizard, /htmlFor="new-customer-followup-note"[\s\S]*>Whats the follow up\?<\/span>[\s\S]*id="new-customer-followup-note"[\s\S]*required/);
    assert.doesNotMatch(wizard, /Quick note \(optional\)/i);
    assert.match(wizard, /from\('notes'\)\.insert\(\{[\s\S]*body: firstNote\.trim\(\)[\s\S]*if \(noteErr\) throw new Error\(noteErr\.message\)/);
  });

  it('keeps Dashboard and Customers on the same shared wizard', async () => {
    const [dashboardEntry, customers] = await Promise.all([
      read('src/components/QuickCreate.tsx'),
      read('src/pages/Customers.tsx'),
    ]);

    assert.match(dashboardEntry, /NewCustomerWizard/);
    assert.match(customers, /NewCustomerWizard/);
  });
});
