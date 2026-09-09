import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

it('routes both completion dropdowns and the technician action through the choice dialog', async () => {
  const [detail, schedule, dialog] = await Promise.all([
    read('src/pages/JobDetail.tsx'), read('src/pages/Service.tsx'), read('src/components/JobCompletionDialog.tsx'),
  ]);
  assert.match(detail, /status === 'Completed'\) \{ onComplete\(\); return; \}/);
  assert.match(detail, /onComplete=\{\(\) => setShowCompletion\(true\)\}/);
  assert.match(detail, /onClick=\{\(\) => setShowCompletion\(true\)\}/);
  assert.match(schedule, /u.status === 'Completed'[\s\S]*setCompletionJob[\s\S]*return false/);
  assert.match(schedule, /<JobCompletionDialog/);
  assert.match(dialog, /Close job/);
  assert.match(dialog, /Schedule New Visit/);
  assert.match(dialog, /busy.current\) return/);
  assert.match(dialog, /rpc\('complete_job_visit'/);
  assert.doesNotMatch(dialog, /\.from\('jobs'\)/);
});

it('retains three-state header, customer inventory, and previous-visit provenance', async () => {
  const [detail, previous] = await Promise.all([read('src/pages/JobDetail.tsx'), read('src/components/JobPreviousVisit.tsx')]);
  assert.match(detail, /JOB_DETAIL_STATUS_OPTIONS.map/);
  assert.match(detail, /jobDetailScheduledDate/);
  assert.match(detail, /jobTypeChipColors\[scheduleJobType\(job.job_type\)\]/);
  assert.match(detail, /useJobInventory/);
  assert.match(detail, /n.source_note_id \? 'From previous visit/);
  assert.match(detail, /viewer.source_photo_id \? 'From previous visit/);
  assert.match(previous, /View original job and work history/);
  assert.match(previous, /Inventory from previous visit/);
  assert.match(previous, /Previous amount to collect/);
});

it('protects photo bytes from old-client delete flow with a restrictive RLS guard', async () => {
  const sql = await read('supabase/migrations/20260909165000_job_followup_visits.sql');
  assert.match(sql, /job_photo_path_is_referenced[\s\S]*stable security definer/);
  assert.match(sql, /as restrictive for delete to authenticated/);
  assert.match(sql, /not private.job_photo_path_is_referenced\(name\)/);
  assert.match(sql, /revoke all on function private.job_photo_path_is_referenced\(text\) from public, anon/);
  assert.match(sql, /order by o.name for share/);
  assert.match(sql, /A job photo is unavailable/);
});

it('requires one receipt per source and retains raw workflow while not duplicating operational work', async () => {
  const sql = await read('supabase/migrations/20260909165000_job_followup_visits.sql');
  assert.match(sql, /source_job_id uuid primary key/);
  assert.match(sql, /where id = p_job_id and org_id = v_org for update/);
  assert.match(sql, /completion_workflow_status := old.status/);
  assert.match(sql, /v_new.status := v_status/);
  assert.match(sql, /v_new.amount_to_collect := null/);
  assert.match(sql, /v_prior.inventory_snapshot/);
  assert.match(sql, /v_prior.parts_snapshot/);
  assert.doesNotMatch(sql, /insert into public\.(time_entries|tasks|parts|inventory_items|job_assignments)\b/i);
  assert.doesNotMatch(sql, /update public\.inventory_items/i);
});
