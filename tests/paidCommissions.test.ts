import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  PAID_COMMISSION_SALESPEOPLE,
  commissionAmount,
  commissionMonthDate,
  paidCommissionDateRangeValid,
  paidCommissionDateValid,
  paidCommissionTotal,
  paidCommissionValuesValid,
  shiftCommissionMonth,
} from '../src/lib/paidCommissions.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('paid commissions tracker', () => {
  it('keeps the exact requested salesperson order and validates paid periods', () => {
    assert.deepEqual(PAID_COMMISSION_SALESPEOPLE, ['Alex', 'Ben', 'Grace', 'Bryson', 'David', 'Bad']);
    assert.equal(paidCommissionDateValid('2026-08-31'), true);
    assert.equal(paidCommissionDateValid('2026-02-29'), false);
    assert.equal(paidCommissionDateRangeValid({ startDate: '2026-08-01', endDate: '2026-08-31' }), true);
    assert.equal(paidCommissionDateRangeValid({ startDate: '2026-09-01', endDate: '2026-08-31' }), false);
    assert.equal(commissionMonthDate('2026-08'), '2026-08-01');
    assert.equal(commissionMonthDate('2026-13'), null);
    assert.equal(shiftCommissionMonth('2026-01', -1), '2025-12');
    assert.equal(shiftCommissionMonth('2026-12', 1), '2027-01');
  });

  it('calculates row amounts and salesperson totals to currency precision', () => {
    assert.equal(commissionAmount(12_345.67, 4.25), 524.69);
    assert.equal(commissionAmount(Number.NaN, 5), 0);
    assert.equal(paidCommissionTotal([
      { commission_amount: 524.69 },
      { commission_amount: '100.10' },
      { commission_amount: 0 },
    ]), 624.79);
  });

  it('accepts complete business values and rejects unsafe input', () => {
    assert.equal(paidCommissionValuesValid({ paidOn: '2026-08-31', customerName: 'Jordan Smith', saleAmount: 15000, commissionPercentage: 3.5 }), true);
    assert.equal(paidCommissionValuesValid({ paidOn: '2026-08-31', customerName: ' ', saleAmount: 15000, commissionPercentage: 3.5 }), false);
    assert.equal(paidCommissionValuesValid({ paidOn: '2026-08-31', customerName: 'Jordan', saleAmount: 0, commissionPercentage: 3.5 }), false);
    assert.equal(paidCommissionValuesValid({ paidOn: '2026-08-31', customerName: 'Jordan', saleAmount: 15000, commissionPercentage: 101 }), false);
    assert.equal(paidCommissionValuesValid({ paidOn: 'not-a-date', customerName: 'Jordan', saleAmount: 15000, commissionPercentage: 3.5 }), false);
  });

  it('wires persistent owner-only CRUD and derives amounts in the database', async () => {
    const [migration, paidDateMigration, hook, component, page] = await Promise.all([
      read('supabase/migrations/20260831203735_add_paid_commissions_tracker.sql'),
      read('supabase/migrations/20260831220843_add_paid_commission_date.sql'),
      read('src/hooks/usePaidCommissions.ts'),
      read('src/components/PaidCommissionsTracker.tsx'),
      read('src/pages/OwnersCorner.tsx'),
    ]);
    assert.match(migration, /create table public\.paid_commissions/i);
    assert.match(migration, /commission_amount numeric\(12, 2\)[\s\S]*generated always as[\s\S]*sale_amount \* commission_percentage \/ 100/i);
    assert.match(migration, /alter table public\.paid_commissions enable row level security/i);
    assert.match(migration, /for select[\s\S]*auth_role\(\)\) = 'owner_manager'/i);
    assert.match(migration, /for insert[\s\S]*created_by = \(select auth\.uid\(\)\)[\s\S]*auth_role\(\)\) = 'owner_manager'/i);
    assert.match(migration, /create index paid_commissions_created_by_idx[\s\S]*on public\.paid_commissions \(created_by\)/i);
    assert.match(migration, /for update[\s\S]*using[\s\S]*auth_role\(\)\) = 'owner_manager'[\s\S]*with check[\s\S]*auth_role\(\)\) = 'owner_manager'/i);
    assert.match(migration, /for delete[\s\S]*auth_role\(\)\) = 'owner_manager'/i);
    assert.match(migration, /revoke all on table public\.paid_commissions from anon, authenticated/i);
    assert.match(migration, /grant select[\s\S]*grant insert[\s\S]*grant update[\s\S]*grant delete/i);
    assert.match(paidDateMigration, /add column if not exists paid_on date/i);
    assert.match(paidDateMigration, /set paid_on = commission_month[\s\S]*where paid_on is null/i);
    assert.match(paidDateMigration, /alter column paid_on set not null/i);
    assert.match(paidDateMigration, /create index if not exists paid_commissions_org_paid_on_salesperson_idx/i);
    assert.match(paidDateMigration, /grant insert \(paid_on\)[\s\S]*grant update \(paid_on\)/i);
    assert.match(hook, /\.from\('paid_commissions'\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*\.gte\('paid_on', startDate\)[\s\S]*\.lte\('paid_on', endDate\)/);
    assert.match(hook, /\.insert\([\s\S]*created_by: profile\.id/);
    assert.match(component, /commissionPercentage\.trim\(\) !== ''/);
    assert.match(hook, /\.update\(values\)\.eq\('id', id\)\.eq\('org_id', profile\.org_id\)/);
    assert.match(hook, /\.delete\(\)[\s\S]*\.eq\('id', id\)[\s\S]*\.eq\('org_id', profile\.org_id\)/);
    assert.match(component, /aria-haspopup="dialog"[\s\S]*Open workbook/);
    assert.match(component, /role="dialog"[\s\S]*Paid Commissions/);
    assert.match(component, /Paid period start date[\s\S]*type="date"[\s\S]*Paid period end date[\s\S]*type="date"/);
    assert.match(component, /paidCommissionDateRangeValid\(range\)/);
    assert.match(component, /Customer name[\s\S]*Sale amount[\s\S]*Commission %[\s\S]*Commission amount/);
    assert.match(component, /PAID_COMMISSION_SALESPEOPLE\.map/);
    assert.match(component, /role="tablist"[\s\S]*role="tab"/);
    assert.match(component, /paidCommissionTotal\(entries\)/);
    assert.match(component, /const closeWorkbook = \(\) => \{[\s\S]*setEditor\(null\)[\s\S]*setIsOpen\(false\)/);
    assert.match(component, /type="button" onClick=\{onCancel\}[\s\S]*Cancel/);
    assert.match(page, /<PaidCommissionsTracker \/>/);
  });
});
