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

describe('Dashboard Revenue Overview filters', () => {
  it('defaults to Closed-Won across every owner and store', () => {
    assert.deepEqual(DEFAULT_DASHBOARD_REVENUE_FILTERS, {
      outcome: 'closed_won',
      assignedTo: null,
      locationId: null,
    });
    assert.equal(DASHBOARD_REVENUE_OUTCOME_LABELS.closed_won, 'Closed-Won');
    assert.equal(DASHBOARD_REVENUE_OUTCOME_LABELS.all_closed, 'All Closed');
    assert.equal(
      dashboardRevenueFilterSummary(DEFAULT_DASHBOARD_REVENUE_FILTERS, [], []),
      'Closed-Won · All Owners · All Stores',
    );
  });

  it('builds the unique five-argument RPC contract with nullable filters', () => {
    const start = new Date('2026-08-01T05:00:00.000Z');
    const end = new Date('2026-09-01T04:59:59.999Z');
    assert.deepEqual(
      dashboardRevenueRpcParams(
        { start, end },
        { outcome: 'all_closed', assignedTo: 'owner-1', locationId: 'store-1' },
      ),
      {
        p_start: start.toISOString(),
        p_end: end.toISOString(),
        p_outcome: 'all_closed',
        p_assigned_to: 'owner-1',
        p_location_id: 'store-1',
      },
    );
  });

  it('renders selected owner and store names in the active filter summary', () => {
    assert.equal(
      dashboardRevenueFilterSummary(
        { outcome: 'all_closed', assignedTo: 'owner-1', locationId: 'store-2' },
        [{ id: 'owner-1', name: 'Brandon Solem' }],
        [{ id: 'store-2', name: 'Minot' }],
      ),
      'All Closed · Brandon Solem · Minot',
    );
  });

  it('wires independent revenue loading and accessible outcome, owner, and store controls', async () => {
    const [dashboard, hook] = await Promise.all([
      read('src/pages/Dashboard.tsx'),
      read('src/hooks/useDashboard.ts'),
    ]);

    assert.match(dashboard, /aria-label="Revenue outcome"/);
    assert.match(dashboard, /<option value="">All Owners<\/option>/);
    assert.match(dashboard, /<option value="">All Stores<\/option>/);
    assert.match(dashboard, /revenueOwners\.map/);
    assert.match(dashboard, /revenueStores\.map/);
    assert.match(hook, /rpc\(\s*'dashboard_revenue_summary'/);
    assert.match(hook, /useEffect\(\(\) => \{ fetchStats\(\); \}, \[fetchStats\]\);/);
    assert.match(hook, /useEffect\(\(\) => \{ fetchRevenue\(\); \}, \[fetchRevenue\]\);/);
  });

  it('keeps the old dashboard summary signature and adds an RLS-scoped aggregate without row caps', async () => {
    const migration = await read('supabase/migrations/20260825141940_dashboard_revenue_filters.sql');

    assert.doesNotMatch(migration, /create or replace function public\.dashboard_summary/);
    assert.match(migration, /create or replace function public\.dashboard_revenue_summary\([\s\S]*?p_outcome text,[\s\S]*?p_assigned_to uuid,[\s\S]*?p_location_id uuid/);
    assert.match(migration, /security invoker/);
    assert.match(migration, /select public\.auth_org\(\) as org_id/);
    assert.match(migration, /s\.org_id = d\.org_id/);
    assert.match(migration, /when 'closed_won' then s\.is_won/);
    assert.match(migration, /when 'all_closed' then s\.is_won or s\.is_lost/);
    assert.match(migration, /revoke all on function public\.dashboard_revenue_summary\(timestamptz,timestamptz,text,uuid,uuid\)/);
    assert.match(migration, /grant execute on function public\.dashboard_revenue_summary\(timestamptz,timestamptz,text,uuid,uuid\)/);
    assert.doesNotMatch(migration, /\blimit\b/i);
  });

  it('records historical lost close times and maintains both terminal outcomes going forward', async () => {
    const migration = await read('supabase/migrations/20260825141940_dashboard_revenue_filters.sql');

    assert.match(migration, /and s\.is_lost[\s\S]*?and d\.closed_at is null/);
    assert.match(migration, /coalesce\(is_won, false\) or coalesce\(is_lost, false\)/);
    assert.match(migration, /new\.closed_at = now\(\)/);
    assert.match(migration, /deals_org_owner_closed_at_idx/);
    assert.match(migration, /deals_org_location_closed_at_idx/);
  });
});
