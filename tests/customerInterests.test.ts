import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('New Customer interest choices', () => {
  it('uses exactly Brandon requested Step 3 choices and retains Estimated Value', async () => {
    const wizard = await read('src/components/NewCustomerWizard.tsx');
    const interestsMatch = wizard.match(/const INTERESTS = \[([\s\S]*?)\] as const;/);

    assert.ok(interestsMatch);
    const choices = [...interestsMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
    assert.deepEqual(choices, [
      'Hot Tubs',
      'Swim Spas',
      'Saunas',
      'Game Room',
      'Pools',
      'Patio Furniture',
      'Gazebo',
      'Massage Chair',
      'Other',
    ]);
    assert.match(wizard, /Estimated Value \(Optional\)[\s\S]*id="new-customer-estimated-value"/);
  });

  it('shares the same wizard between the Dashboard and Customers entry points', async () => {
    const [dashboardEntry, customers] = await Promise.all([
      read('src/components/QuickCreate.tsx'),
      read('src/pages/Customers.tsx'),
    ]);

    assert.match(dashboardEntry, /NewCustomerWizard/);
    assert.match(customers, /NewCustomerWizard/);
  });
});
