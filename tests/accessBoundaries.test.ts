import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('named Fix-It and owner-only navigation boundaries', () => {
  it('resolves Fix-It access from the server and hides every feed entry point when denied', async () => {
    const [hook, rail] = await Promise.all([
      read('src/hooks/useFixItAccess.ts'),
      read('src/components/layout/AdminRail.tsx'),
    ]);

    assert.match(hook, /rpc\('can_use_fix_it'\)/);
    assert.match(rail, /useFixItAccess/);
    assert.match(rail, /canUseFixIt && \(/);
    assert.match(rail, /useFixItFeed\(canUseFixIt/);
    assert.match(rail, /useFixItActiveCount\(canUseFixIt/);
  });

  it('keeps Owners Corner out of both navigation surfaces for non-owners', async () => {
    const [header, sidebar] = await Promise.all([
      read('src/components/layout/Header.tsx'),
      read('src/components/layout/Sidebar.tsx'),
    ]);

    assert.match(header, /ownerOnly: true/);
    assert.match(header, /!item\.ownerOnly \|\| profile\?\.role === 'owner_manager'/);
    assert.match(sidebar, /!item\.ownerOnly \|\| profile\?\.role === 'owner_manager'/);
  });

  it('enforces the Fix-It membership and report-library exception in RLS', async () => {
    const [migration, aclMigration] = await Promise.all([
      read('supabase/migrations/20260831185000_limit_fix_it_and_route_suggestions.sql'),
      read('supabase/migrations/20260831185500_harden_fix_it_function_acl.sql'),
    ]);

    assert.match(migration, /create table if not exists public\.fix_it_access_members/i);
    assert.match(migration, /create or replace function public\.can_use_fix_it\(\)/i);
    assert.match(migration, /'andrew@ndai\.pro'[\s\S]*'matt@spasnd\.com'[\s\S]*'brandon_solem@hotmail\.com'/i);
    assert.match(migration, /create policy fix_it_posts_read[\s\S]*can_use_fix_it/is);
    assert.match(migration, /create policy fix_it_comments_read[\s\S]*can_use_fix_it/is);
    assert.match(migration, /create policy fix_it_attachments_read[\s\S]*purpose = 'report'[\s\S]*can_use_fix_it/is);
    assert.match(migration, /create policy fix_it_files_read[\s\S]*attachment\.purpose = 'report'[\s\S]*can_use_fix_it/is);
    assert.match(aclMigration, /alter function public\.can_use_fix_it\(\) security invoker/i);
    assert.match(aclMigration, /revoke all on function public\.can_use_fix_it\(\) from public, anon/i);
    assert.match(aclMigration, /revoke all on function public\.notify_brandon_on_suggestion\(\) from public, anon, authenticated/i);
  });

  it('keeps the media library on report attachments without reading its Fix-It post', async () => {
    const mediaHook = await read('src/hooks/useMediaLibrary.ts');
    assert.doesNotMatch(mediaHook, /from\('fix_it_posts'\)/);
    assert.match(mediaHook, /from\('fix_it_attachments'\)/);
    assert.match(mediaHook, /\.eq\('purpose', 'report'\)/);
  });
});
