import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  authorizeInventoryProfits,
  bearerToken,
  INVENTORY_PROFITS_MIME,
  inventoryProfitsHeaders,
  isProductionSupabaseUrl,
} from '../api/_lib/inventory-profits-access.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url));

describe('Owners Corner Inventory Profits workbook', () => {
  it('keeps exact source bytes private and exposes them only to the owner import flow', async () => {
    const [pageBytes, libraryBytes, endpointBytes, vercelBytes, workbook] = await Promise.all([
      read('src/pages/OwnersCorner.tsx'),
      read('src/components/OwnerWorkbookLibrary.tsx'),
      read('api/owners/inventory-profits.ts'),
      read('vercel.json'),
      read('api/_assets/Inventory Profits.xlsx'),
    ]);
    const page = pageBytes.toString('utf8');
    const library = libraryBytes.toString('utf8');
    const endpoint = endpointBytes.toString('utf8');
    const vercel = JSON.parse(vercelBytes.toString('utf8')) as { functions: Record<string, { includeFiles?: string }> };

    await assert.rejects(read('public/Inventory Profits.xlsx'), /ENOENT/);
    assert.equal(workbook.length, 42_471);
    assert.equal(workbook.subarray(0, 2).toString('ascii'), 'PK');
    assert.equal(
      createHash('sha256').update(workbook).digest('hex'),
      'e18ee4ac7288dc0896a150fcaeb779273dab7e91ac7b44c833b2e69d5fa379a1',
    );
    assert.equal(vercel.functions['api/owners/inventory-profits.ts']?.includeFiles, 'api/_assets/Inventory Profits.xlsx');
    assert.match(endpoint, /authorizeInventoryProfits\(token/);
    assert.match(endpoint, /caller\.auth\.getUser\(accessToken\)/);
    assert.match(endpoint, /\.from\('profiles'\)[\s\S]*\.select\('id,org_id,role'\)[\s\S]*\.eq\('id', userId\)/);
    assert.ok(endpoint.indexOf('authorizeInventoryProfits(token') < endpoint.indexOf('readFile(WORKBOOK_PATH)'));
    assert.match(page, /<OwnerWorkbookLibrary \/>/);
    assert.doesNotMatch(page, /href="\/Inventory%20Profits\.xlsx"/);
    assert.match(library, /fetch\('\/api\/owners\/inventory-profits'/);
    assert.match(library, /Authorization: `Bearer \$\{session\.access_token\}`/);
    assert.match(library, /await response\.arrayBuffer\(\)/);
    assert.match(library, /INVENTORY_PROFITS_SOURCE_SHA/);
    assert.doesNotMatch(library, /link\.download/);
    const accessBanner = page.indexOf('Owner access is active');
    const profitsCard = page.indexOf('<OwnerWorkbookLibrary');
    const destinations = page.indexOf('aria-label="Owner destinations"');
    assert.ok(accessBanner < profitsCard && profitsCard < destinations);
  });

  it('fails closed unless a production-project token belongs to an owner profile', async () => {
    assert.equal(bearerToken('Bearer real-token'), 'real-token');
    assert.equal(bearerToken('Basic real-token'), null);
    assert.equal(isProductionSupabaseUrl('https://kxyqgkimcdxvfkceoixs.supabase.co'), true);
    assert.equal(isProductionSupabaseUrl('https://another-project.supabase.co'), false);

    const profiles = new Map([
      ['owner', { id: 'owner', org_id: 'org-a', role: 'owner_manager' }],
      ['manager', { id: 'manager', org_id: 'org-a', role: 'service_manager' }],
    ]);
    const dependencies = {
      verifyUser: async (token: string) => token === 'owner-token' ? 'owner' : token === 'manager-token' ? 'manager' : null,
      loadProfile: async (userId: string) => profiles.get(userId) ?? null,
    };

    assert.deepEqual(await authorizeInventoryProfits(null, dependencies), {
      ok: false, status: 401, error: 'Missing authorization',
    });
    const invalid = await authorizeInventoryProfits('bad-token', dependencies);
    const manager = await authorizeInventoryProfits('manager-token', dependencies);
    assert.equal(invalid.ok, false);
    assert.equal(manager.ok, false);
    if (invalid.ok || manager.ok) assert.fail('Invalid and non-owner tokens must fail closed');
    assert.equal(invalid.status, 401);
    assert.equal(manager.status, 403);
    assert.deepEqual(await authorizeInventoryProfits('owner-token', dependencies), {
      ok: true, userId: 'owner', orgId: 'org-a',
    });
  });

  it('returns the exact private-download headers', () => {
    assert.deepEqual(inventoryProfitsHeaders(42_471), {
      'Cache-Control': 'private, no-store',
      'Content-Type': INVENTORY_PROFITS_MIME,
      'Content-Disposition': 'attachment; filename="Inventory Profits.xlsx"; filename*=UTF-8\'\'Inventory%20Profits.xlsx',
      'Content-Length': '42471',
    });
  });
});
