import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { isCompletedDealSaleInventory } from '../src/lib/inventoryDealAssignment.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('completed-sale inventory and owner removal', () => {
  it('highlights only sold deal inventory whose linked schedule job is completed', () => {
    const base = {
      status: 'Sold' as const,
      dealAssignment: { dealId: 'deal-1', customer: { id: 'contact-1', first_name: 'A', last_name: 'B', phone: '', customer_type: 'Customer' as const } },
      job: { id: 'job-1', status: 'Completed' as const },
    };

    assert.equal(isCompletedDealSaleInventory(base), true);
    assert.equal(isCompletedDealSaleInventory({ ...base, status: 'In Stock' }), false);
    assert.equal(isCompletedDealSaleInventory({ ...base, dealAssignment: null }), false);
    assert.equal(isCompletedDealSaleInventory({ ...base, job: { id: 'job-1', status: 'Delivery' } }), false);
  });

  it('renders the live completion state in red and refreshes when jobs change', async () => {
    const [hook, page] = await Promise.all([
      read('src/hooks/useInventory.ts'),
      read('src/pages/Inventory.tsx'),
    ]);

    assert.match(hook, /job:job_id\(id, status\)/);
    assert.match(hook, /table: 'jobs'[\s\S]*filter: orgFilter/);
    assert.match(page, /data-completed-sale=\{completedSale \? 'true'/);
    assert.match(page, /completedSale[\s\S]*border-red-500 bg-red-500\/20/);
  });

  it('soft-removes active inventory while preserving deal and job foreign keys', async () => {
    const [migration, hook, editor] = await Promise.all([
      read('supabase/migrations/20260831223727_add_inventory_soft_removal.sql'),
      read('src/hooks/useInventory.ts'),
      read('src/components/InventoryEditor.tsx'),
    ]);

    assert.match(migration, /add column if not exists removed_at timestamptz/i);
    assert.match(migration, /add column if not exists removed_by uuid references public\.profiles\(id\)/i);
    assert.match(migration, /idx_inventory_items_removed_by[\s\S]*where removed_by is not null/i);
    assert.match(migration, /drop policy if exists inv_delete/i);
    assert.match(migration, /revoke delete, truncate[^;]*from public, anon, authenticated/i);
    assert.match(migration, /private\.auth_role\(\) <> 'owner_manager'/i);
    assert.match(migration, /update public\.inventory_items[\s\S]*set removed_at = statement_timestamp\(\)[\s\S]*removed_by = \(select auth\.uid\(\)\)/i);
    assert.doesNotMatch(migration, /set deal_id = null|set job_id = null|delete from public\.inventory_items/i);
    assert.match(hook, /\.is\('removed_at', null\)/);
    assert.match(hook, /rpc\('remove_inventory_item'/);
    assert.doesNotMatch(hook, /from\('inventory_items'\)\.delete\(/);
    assert.match(editor, /profile\?\.role === 'owner_manager'/);
    assert.doesNotMatch(editor, /service_manager/);
    assert.match(editor, /Deal and job history will be kept/);
  });

  it('excludes removed rows from active selectors but keeps historical joins unfiltered', async () => {
    const [dealDetail, jobs, pipeline, storeSwitcher, palette, toolFactory] = await Promise.all([
      read('src/pages/DealDetail.tsx'),
      read('src/hooks/useServiceJobs.ts'),
      read('src/hooks/usePipeline.ts'),
      read('src/components/StoreSwitcher.tsx'),
      read('src/components/SearchPalette.tsx'),
      read('src/agent/toolFactory.ts'),
    ]);

    assert.match(dealDetail, /\.eq\('status', 'In Stock'\)[\s\S]*\.is\('removed_at', null\)/);
    assert.match(jobs, /\.eq\('location_id', locationId\)[\s\S]*\.is\('removed_at', null\)/);
    assert.match(pipeline, /\.eq\('customer_id', data\.contact_id\)[\s\S]*\.is\('removed_at', null\)/);
    assert.match(storeSwitcher, /\.is\('removed_at', null\)/);
    assert.match(palette, /inventory_items[\s\S]*\.is\('removed_at', null\)/);
    assert.match(toolFactory, /inventory_items[\s\S]*\.is\('removed_at', null\)/);

    const linkedJobRead = jobs.slice(jobs.indexOf(".eq('job_id', jobId)" ) - 180, jobs.indexOf(".eq('job_id', jobId)") + 120);
    assert.doesNotMatch(linkedJobRead, /removed_at/);

    const linkedDealRead = pipeline.slice(
      pipeline.indexOf(".select('*, contact:contact_id"),
      pipeline.indexOf('if (!data.inventory_item'),
    );
    assert.match(linkedDealRead, /inventory_item:inventory_item_id/);
    assert.doesNotMatch(linkedDealRead, /removed_at/);
  });
});
