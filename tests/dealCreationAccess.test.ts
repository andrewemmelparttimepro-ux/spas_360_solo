import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('New Deal access', () => {
  it('allows every human sales role to insert only within its organization', async () => {
    const migration = await read('supabase/migrations/20260831224439_allow_service_managers_to_create_deals.sql');

    assert.match(migration, /alter policy deal_insert on public\.deals[\s\S]*to authenticated/i);
    assert.match(migration, /org_id = \(select public\.auth_org\(\)\)/i);
    assert.match(migration, /public\.auth_role\(\)[\s\S]*'owner_manager'[\s\S]*'service_manager'[\s\S]*'salesperson'/i);
    assert.doesNotMatch(migration, /technician/);
  });

  it('keeps Deals and Customers on the same shared New Deal modal', async () => {
    const [deals, customers] = await Promise.all([
      read('src/pages/Deals.tsx'),
      read('src/pages/Customers.tsx'),
    ]);

    assert.match(deals, /QuickDealModal/);
    assert.match(customers, /QuickDealModal/);
  });
});
