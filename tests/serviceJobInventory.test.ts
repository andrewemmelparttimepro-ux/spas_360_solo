import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { availableInventoryForJob, inventoryChoicesForJob } from '../src/lib/jobSchedule.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const item = (
  id: string,
  overrides: Partial<{
    status: 'In Stock' | 'Sold';
    customer_id: string | null;
    deal_id: string | null;
    job_id: string | null;
    location_id: string;
    notes: string | null;
    dealAssignment: { dealId: string; customer: never } | null;
  }> = {},
) => ({
  id,
  status: 'In Stock' as const,
  customer_id: null,
  deal_id: null,
  job_id: null,
  location_id: 'store-1',
  notes: 'Customer: STOCK',
  dealAssignment: null,
  ...overrides,
});

describe('New Job inventory assignment', () => {
  it('offers only unassigned In Stock units from the selected location', () => {
    const available = availableInventoryForJob([
      item('available'),
      item('sold', { status: 'Sold' }),
      item('customer-assigned', { customer_id: 'customer-2' }),
      item('deal-assigned', { deal_id: 'deal-2' }),
      item('job-assigned', { job_id: 'job-2' }),
      item('active-deal-reservation', { dealAssignment: { dealId: 'deal-3', customer: null as never } }),
      item('imported-customer', { notes: 'Import metadata · Customer: Jane Doe · Need to order: No' }),
      item('other-store', { location_id: 'store-2' }),
    ], 'store-1');

    assert.deepEqual(available.map(candidate => candidate.id), ['available']);
  });

  it('keeps current job units visible beside available stock without exposing unrelated assignments', () => {
    const choices = inventoryChoicesForJob([
      item('available'),
      item('current-job-sold', { status: 'Sold', customer_id: 'customer-1', job_id: 'job-1' }),
      item('current-job-deal', { status: 'Sold', customer_id: 'customer-1', deal_id: 'deal-1', job_id: 'job-1' }),
      item('current-job-other-store', { status: 'Sold', customer_id: 'customer-1', job_id: 'job-1', location_id: 'store-2' }),
      item('other-job', { status: 'Sold', customer_id: 'customer-2', job_id: 'job-2' }),
      item('available-other-store', { location_id: 'store-2' }),
    ], 'job-1', 'store-1');

    assert.deepEqual(choices.map(candidate => candidate.id), [
      'available',
      'current-job-sold',
      'current-job-deal',
      'current-job-other-store',
    ]);
  });

  it('loads exact linked rows separately from location-scoped inventory choices', async () => {
    const hook = await read('src/hooks/useServiceJobs.ts');
    const inventoryHook = hook.slice(hook.indexOf('export function useJobInventory'));

    assert.match(inventoryHook, /const locationInventoryPromise = locationId[\s\S]*\.eq\('location_id', locationId\)/);
    assert.match(inventoryHook, /linkedInventoryResult[\s\S]*\.eq\('job_id', jobId\)/);
    assert.doesNotMatch(
      inventoryHook.slice(inventoryHook.indexOf('linkedInventoryResult'), inventoryHook.indexOf(".from('deals')")),
      /\.eq\('location_id', locationId\)/,
    );
    assert.match(inventoryHook, /new Map<string, Record<string, unknown>>\(\)[\s\S]*locationInventoryResult\.data[\s\S]*linkedInventoryResult\.data/);
  });

  it('removes the ordinary status selector but keeps the internal default', async () => {
    const service = await read('src/pages/Service.tsx');
    const modal = service.slice(service.indexOf('{/* Create Job Modal */}'), service.indexOf('<DragDropContext'));

    assert.doesNotMatch(modal, /newJob\.status/);
    assert.doesNotMatch(modal, /<option>In Progress<\/option><option>Delivery<\/option>/);
    assert.match(service, /job_type: newJob\.job_type, status: 'In Progress'/);
  });

  it('uses the searchable Inventory-style chooser and reports RPC failures without closing', async () => {
    const [service, hook] = await Promise.all([
      read('src/pages/Service.tsx'),
      read('src/hooks/useServiceJobs.ts'),
    ]);

    assert.match(service, /<DealInventorySelector/);
    assert.match(service, /items=\{availableInventory\}/);
    assert.match(service, /title="Attach inventory to this job"/);
    assert.match(service, /selectedInventory \? inventoryUnitLabel\(selectedInventory\)/);
    assert.match(service, /if \(!result\.id\) \{[\s\S]*setCreateJobError\(message\)[\s\S]*return;[\s\S]*setShowCreate\(false\)/);
    assert.match(hook, /supabase\.rpc\('create_job_with_inventory'/);
    assert.doesNotMatch(hook, /const createJob[\s\S]{0,1200}\.from\('jobs'\)\.insert/);
  });

  it('locks and atomically assigns only the exact available inventory row', async () => {
    const [sql, wrapperSql] = await Promise.all([
      read('supabase/migrations/20260827031916_delete_unscheduled_job_release_inventory.sql'),
      read('supabase/migrations/20260826194847_create_job_with_inventory.sql'),
    ]);

    assert.match(sql, /from public\.inventory_items i[\s\S]*where i\.id = p_inventory_item_id[\s\S]*for update/);
    assert.match(sql, /v_inventory_status is distinct from 'In Stock'[\s\S]*v_inventory_customer_id is not null[\s\S]*v_inventory_deal_id is not null[\s\S]*v_inventory_job_id is not null[\s\S]*v_inventory_customer_stock/);
    assert.match(sql, /exists \(select 1 from public\.deals d[\s\S]*d\.inventory_item_id = p_inventory_item_id/);
    assert.match(sql, /when 'Service' then 'In Progress'[\s\S]*insert into public\.jobs[\s\S]*v_initial_status[\s\S]*returning id into v_job_id/);
    assert.match(sql, /update public\.inventory_items[\s\S]*status = 'Sold'[\s\S]*customer_id = p_contact_id[\s\S]*job_id = v_job_id/);
    assert.match(sql, /status = 'In Stock'[\s\S]*customer_id is null[\s\S]*deal_id is null[\s\S]*job_id is null/);
    assert.match(sql, /if not found then[\s\S]*raise exception 'That inventory unit is no longer available'/);
    assert.match(sql, /security definer[\s\S]*v_org := private\.auth_org\(\)[\s\S]*v_role := private\.auth_role\(\)/);
    assert.match(wrapperSql, /language sql[\s\S]*security invoker[\s\S]*select private\.create_job_with_inventory/);
    assert.match(sql, /revoke all on function private\.create_job_with_inventory[\s\S]*from public, anon/);
    assert.match(sql, /create or replace function private\.require_deal_won_fulfillment[\s\S]*where i\.id = new\.inventory_item_id[\s\S]*for update/);
  });

  it('offers a deliberate delete flow only for unscheduled manager jobs', async () => {
    const detail = await read('src/pages/JobDetail.tsx');

    assert.match(detail, /const canDelete = !job\.scheduled_at/);
    assert.match(detail, /profile\?\.role === 'owner_manager'[\s\S]*profile\?\.role === 'service_manager'/);
    assert.match(detail, /Delete this unscheduled job\?/);
    assert.match(detail, /Any inventory attached only to this job returns to Stock/);
    assert.match(detail, /await deleteJob\(\)/);
    assert.match(detail, /navigate\('\/service', \{ replace: true \}\)/);
  });

  it('atomically releases job-only inventory and preserves deal-backed sales before deleting', async () => {
    const sql = await read('supabase/migrations/20260827031916_delete_unscheduled_job_release_inventory.sql');

    assert.match(sql, /select j\.scheduled_at, j\.contact_id[\s\S]*from public\.jobs j[\s\S]*for update/);
    assert.match(sql, /if v_scheduled_at is not null then[\s\S]*Only an unscheduled job can be deleted/);
    assert.match(sql, /exists \(select 1 from public\.job_photos[\s\S]*Remove this job''s photos before deleting it/);
    assert.match(sql, /update public\.inventory_items[\s\S]*set job_id = null[\s\S]*deal_id is not null/);
    assert.match(sql, /status = 'In Stock'[\s\S]*customer_id = null[\s\S]*job_id = null[\s\S]*date_sold = null[\s\S]*where job_id = p_job_id and deal_id is null and status = 'Sold'[\s\S]*customer_id is not distinct from v_contact_id/);
    assert.match(sql, /if exists \(select 1 from public\.inventory_items i where i\.job_id = p_job_id\)[\s\S]*unexpected inventory assignment/);
    assert.match(sql, /delete from public\.jobs[\s\S]*scheduled_at is null/);
    assert.match(sql, /v_role not in \('owner_manager', 'service_manager'\)/);
    assert.match(sql, /security definer[\s\S]*v_org := private\.auth_org\(\)/);
    assert.match(sql, /public\.delete_unscheduled_job[\s\S]*security invoker/);
  });

  it('edits the job heading and exposes attached inventory with a multi-unit replacement flow', async () => {
    const [detail, selector, hook] = await Promise.all([
      read('src/pages/JobDetail.tsx'),
      read('src/components/DealInventorySelector.tsx'),
      read('src/hooks/useServiceJobs.ts'),
    ]);

    assert.match(detail, /label="job heading"[\s\S]*field="title"[\s\S]*onSave=\{saveJob\}/);
    assert.match(detail, /data-job-inventory[\s\S]*Units attached to this job/);
    assert.match(detail, /attachedInventory\.map\(item =>[\s\S]*inventoryUnitLabel\(item\)/);
    assert.match(detail, /<DealInventorySelector[\s\S]*multiple[\s\S]*initialSelection=\{attachedInventory\.map/);
    assert.match(selector, /props\.multiple[\s\S]*setSelectedInventoryIds/);
    assert.match(selector, /Clear every selection to detach inventory from this job/);
    assert.match(hook, /supabase\.rpc\('replace_job_inventory'/);
  });

  it('replaces the complete job inventory set atomically and preserves unrelated unit state', async () => {
    const sql = await read('supabase/migrations/20260827164809_replace_job_inventory.sql');

    assert.match(sql, /from public\.jobs j[\s\S]*where j\.id = p_job_id[\s\S]*for update/);
    assert.match(sql, /where i\.job_id = p_job_id or i\.id = any\(v_selected_ids\)[\s\S]*order by i\.id[\s\S]*for update/);
    assert.match(sql, /i\.location_id = v_location_id[\s\S]*cardinality\(v_selected_ids\)/);
    assert.match(sql, /i\.status is distinct from 'In Stock'[\s\S]*i\.customer_id is not null[\s\S]*i\.deal_id is not null[\s\S]*i\.job_id is not null/);
    assert.match(sql, /exists \([\s\S]*from public\.deals d[\s\S]*d\.inventory_item_id = i\.id/);
    assert.match(sql, /set job_id = null[\s\S]*i\.deal_id is not null/);
    assert.match(sql, /status = 'In Stock'[\s\S]*customer_id = null[\s\S]*job_id = null[\s\S]*date_sold = null[\s\S]*date_delivered = null/);
    assert.match(sql, /status = 'Sold'[\s\S]*customer_id = v_contact_id[\s\S]*job_id = p_job_id/);
    assert.match(sql, /A deselected unit has an unexpected inventory state/);
    assert.match(sql, /security definer[\s\S]*private\.auth_org\(\)[\s\S]*private\.auth_role\(\)/);
    assert.match(sql, /public\.replace_job_inventory[\s\S]*security invoker/);
  });
});
