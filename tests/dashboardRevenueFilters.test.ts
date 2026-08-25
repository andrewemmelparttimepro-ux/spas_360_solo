import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  dashboardRevenueFilterSummary,
  dashboardRevenueRpcParams,
  DASHBOARD_REVENUE_OUTCOME_LABELS,
  DEFAULT_DASHBOARD_REVENUE_FILTERS,
} from '../src/lib/dashboardRevenueFilters.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const FOLLOW_UP_MIGRATION = 'supabase/migrations/20260825144549_dashboard_revenue_followups.sql';

describe('Dashboard Revenue Overview filters', () => {
  it('defaults to Closed-Won across every owner and store', () => {
    assert.deepEqual(DEFAULT_DASHBOARD_REVENUE_FILTERS, {
      outcome: 'closed_won',
      assignedTo: null,
      locationId: null,
    });
    assert.equal(DASHBOARD_REVENUE_OUTCOME_LABELS.closed_won, 'Closed-Won');
    assert.equal(DASHBOARD_REVENUE_OUTCOME_LABELS.closed_lost, 'Closed-Lost');
    assert.equal(
      dashboardRevenueFilterSummary(DEFAULT_DASHBOARD_REVENUE_FILTERS, [], []),
      'Closed-Won · All Sales Associates · All Stores',
    );
  });

  it('builds the unique five-argument RPC contract with nullable filters', () => {
    const start = new Date('2026-08-01T05:00:00.000Z');
    const end = new Date('2026-09-01T04:59:59.999Z');
    assert.deepEqual(
      dashboardRevenueRpcParams(
        { start, end },
        { outcome: 'closed_lost', assignedTo: 'owner-1', locationId: 'store-1' },
      ),
      {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
        p_outcome: 'closed_lost',
        p_assigned_to: 'owner-1',
        p_location_id: 'store-1',
      },
    );
  });

  it('renders selected owner and store names in the active filter summary', () => {
    assert.equal(
      dashboardRevenueFilterSummary(
        { outcome: 'closed_lost', assignedTo: 'owner-1', locationId: 'store-2' },
        [{ id: 'owner-1', name: 'Brandon Solem' }],
        [{ id: 'store-2', name: 'Minot (MCHL)' }],
      ),
      'Closed-Lost · Brandon Solem · Minot (MCHL)',
    );
  });

  it('wires independent revenue loading and accessible outcome, owner, and store controls', async () => {
    const [dashboard, hook] = await Promise.all([
      read('src/pages/Dashboard.tsx'),
      read('src/hooks/useDashboard.ts'),
    ]);

    assert.match(dashboard, /aria-label="Revenue outcome"/);
    assert.match(dashboard, /<option value="">All Sales Associates<\/option>/);
    assert.match(dashboard, /<option value="">All Stores<\/option>/);
    assert.match(dashboard, /revenueOwners\.map/);
    assert.match(dashboard, /revenueStores\.map/);
    assert.match(hook, /rpc\(\s*'dashboard_revenue_summary'/);
    assert.match(hook, /useEffect\(\(\) => \{ fetchStats\(\); \}, \[fetchStats\]\);/);
    assert.match(hook, /useEffect\(\(\) => \{ fetchRevenue\(\); \}, \[fetchRevenue\]\);/);
  });

  it('keeps the old dashboard summary signature and adds an RLS-scoped aggregate without row caps', async () => {
    const migration = await read(FOLLOW_UP_MIGRATION);

    assert.doesNotMatch(migration, /create or replace function public\.dashboard_summary/);
    assert.match(migration, /create or replace function public\.dashboard_revenue_summary\([\s\S]*?p_outcome text,[\s\S]*?p_assigned_to uuid,[\s\S]*?p_location_id uuid/);
    assert.match(migration, /security invoker/);
    assert.match(migration, /select public\.auth_org\(\) as org_id/);
    assert.match(migration, /s\.org_id = d\.org_id/);
    assert.match(migration, /when 'closed_won' then s\.is_won/);
    assert.match(migration, /when 'closed_lost' then s\.is_lost/);
    assert.doesNotMatch(migration, /all_closed|All Closed/);
    assert.match(migration, /revoke all on function public\.dashboard_revenue_summary\(timestamptz,timestamptz,text,uuid,uuid\)/);
    assert.match(migration, /grant execute on function public\.dashboard_revenue_summary\(timestamptz,timestamptz,text,uuid,uuid\)/);
    assert.doesNotMatch(migration, /\blimit\b/i);
  });

  it('returns every human sales associate, excludes Thrawn by stable ID, and labels Minot exactly', async () => {
    const migration = await read(FOLLOW_UP_MIGRATION);

    assert.match(migration, /associate\.role in \('owner_manager', 'salesperson'\)/);
    assert.match(migration, /associate\.id <> '79ea8493-7436-46ab-a210-26cccdac4f2e'::uuid/);
    assert.doesNotMatch(migration, /lower\(associate\.(?:first_name|last_name|email)\)/);
    assert.match(migration, /location\.id = '00000000-0000-0000-0000-000000000010'::uuid[\s\S]*?then 'Minot \(MCHL\)'/);
  });
});
