import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260821194648_job_photo_private_read_policy.sql';

describe('private job photo rendering', () => {
  it('grants only organization-scoped authenticated reads for metadata-backed objects', async () => {
    const migration = await read(migrationPath);

    assert.match(migration, /drop policy if exists job_photos_read_org on storage\.objects/i);
    assert.match(migration, /create policy job_photos_read_org[\s\S]*for select[\s\S]*to authenticated/i);
    assert.match(migration, /bucket_id = 'job-photos'/);
    assert.match(migration, /from public\.job_photos jp[\s\S]*join public\.jobs j on j\.id = jp\.job_id/);
    assert.match(migration, /jp\.storage_path = storage\.objects\.name/);
    assert.match(migration, /j\.org_id = \(select public\.auth_org\(\)\)/);
    assert.doesNotMatch(migration, /alter table public\.job_photos|create policy .* on public\.job_photos/i);
  });

  it('keeps short-lived signed URLs in memory and renders them in thumbnails and the viewer', async () => {
    const [hook, detail] = await Promise.all([
      read('src/hooks/useJobPhotos.ts'),
      read('src/pages/JobDetail.tsx'),
    ]);

    assert.match(hook, /storage\.from\(BUCKET\)\.createSignedUrl\(path, 60 \* 60\)/);
    assert.match(hook, /const photoUrlCache = new Map/);
    assert.doesNotMatch(hook, /localStorage|sessionStorage|indexedDB/);
    assert.match(detail, /<img src=\{p\.url\}[^>]*loading="lazy"/);
    assert.match(detail, /<img src=\{viewer\.url\}[^>]*object-contain/);
  });

  it('preserves upload and delete paths for private job photos', async () => {
    const hook = await read('src/hooks/useJobPhotos.ts');

    assert.match(hook, /storage\.from\(BUCKET\)\.upload\(path, blob/);
    assert.match(hook, /from\('job_photos'\)\.insert/);
    assert.match(hook, /from\('job_photos'\)\.delete\(\)\.eq\('id', photo\.id\)/);
    assert.match(hook, /storage\.from\(BUCKET\)\.remove\(\[photo\.storage_path\]\)/);
  });
});
