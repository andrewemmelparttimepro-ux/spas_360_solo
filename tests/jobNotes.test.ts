import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Job Notes (Brandon, Sep 4)', () => {
  it('puts Job Notes above Inventory, uses a multiline box where Enter is a new line, and lets notes be edited', async () => {
    const [detail, hook, service, migration] = await Promise.all([
      read('src/pages/JobDetail.tsx'),
      read('src/hooks/useNotes.ts'),
      read('src/pages/Service.tsx'),
      read('supabase/migrations/20260904180000_job_notes_editable_and_seeded.sql'),
    ]);
    assert.ok(detail.indexOf('data-job-notes') < detail.indexOf('data-job-inventory'), 'Job Notes renders before Inventory');
    assert.match(detail, /<textarea[\s\S]*?aria-label="New job note"/);
    assert.doesNotMatch(detail, /onKeyDown=\{e => e\.key === 'Enter' && handleAddNote\(\)\}/);
    assert.match(detail, /aria-label="Edit note"/);
    assert.match(detail, /timeStyle: 'short'/);
    assert.doesNotMatch(detail, /\{job\.description && <div/);
    assert.match(hook, /const updateNote = useCallback/);
    assert.match(hook, /edited_at: new Date\(\)\.toISOString\(\), edited_by: profile\.id/);
    assert.match(service, /job_id: result\.id, body: newJob\.description\.trim\(\), created_by: profile\.id/);
    assert.match(migration, /create policy note_update on public\.notes/);
    assert.match(migration, /grant update \(body, edited_at, edited_by\) on table public\.notes to authenticated/);
    assert.match(migration, /insert into public\.notes \(job_id, body, created_by, created_at\)/);
  });
});
