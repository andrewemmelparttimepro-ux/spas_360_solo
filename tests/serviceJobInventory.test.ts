import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { availableInventoryForJob } from '../src/lib/jobSchedule.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const item = (
  id: string,
  overrides: Partial<{
    status: 'In Stock' | 'Sold';
    customer_id: string | null;
    deal_id: string | null;
    job_id: string | null;
    location_id: string;
  }> = {},
) => ({
  id,
  status: 'In Stock' as const,
  customer_id: null,
  deal_id: null,
  job_id: null,
  location_id: 'store-1',
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
      item('other-store', { location_id: 'store-2' }),
    ], 'store-1');

    assert.deepEqual(available.map(candidate => candidate.id), ['available']);
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
    const sql = await read('supabase/migrations/20260826194847_create_job_with_inventory.sql');

    assert.match(sql, /from public\.inventory_items i[\s\S]*where i\.id = p_inventory_item_id[\s\S]*for update/);
    assert.match(sql, /v_inventory_status is distinct from 'In Stock'[\s\S]*v_inventory_customer_id is not null[\s\S]*v_inventory_deal_id is not null[\s\S]*v_inventory_job_id is not null/);
    assert.match(sql, /insert into public\.jobs[\s\S]*'In Progress'[\s\S]*returning id into v_job_id/);
    assert.match(sql, /update public\.inventory_items[\s\S]*status = 'Sold'[\s\S]*customer_id = p_contact_id[\s\S]*job_id = v_job_id/);
    assert.match(sql, /status = 'In Stock'[\s\S]*customer_id is null[\s\S]*deal_id is null[\s\S]*job_id is null/);
    assert.match(sql, /if not found then[\s\S]*raise exception 'That inventory unit is no longer available'/);
    assert.match(sql, /security definer[\s\S]*v_org := private\.auth_org\(\)[\s\S]*v_role := private\.auth_role\(\)/);
    assert.match(sql, /language sql[\s\S]*security invoker[\s\S]*select private\.create_job_with_inventory/);
    assert.match(sql, /revoke all on function private\.create_job_with_inventory[\s\S]*from public, anon/);
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

    assert.match(sql, /from public\.jobs j[\s\S]*scheduled_at[\s\S]*for update/);
    assert.match(sql, /if v_scheduled_at is not null then[\s\S]*Only an unscheduled job can be deleted/);
    assert.match(sql, /update public\.inventory_items[\s\S]*set job_id = null[\s\S]*deal_id is not null/);
    assert.match(sql, /status = 'In Stock'[\s\S]*customer_id = null[\s\S]*job_id = null[\s\S]*date_sold = null[\s\S]*where job_id = p_job_id[\s\S]*deal_id is null/);
    assert.match(sql, /delete from public\.jobs[\s\S]*scheduled_at is null/);
    assert.match(sql, /v_role not in \('owner_manager', 'service_manager'\)/);
    assert.match(sql, /security definer[\s\S]*v_org := private\.auth_org\(\)/);
    assert.match(sql, /public\.delete_unscheduled_job[\s\S]*security invoker/);
  });
});
