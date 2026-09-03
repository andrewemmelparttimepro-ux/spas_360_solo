import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { checklistItemsFromText, describeWeekdays, formatDueTime } from '../src/lib/recurringChecklists.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260903170000_staff_ops_round_two.sql';

describe('recurring checklists', () => {
  it('parses items and describes schedules the way Brandon says them', () => {
    assert.deepEqual(checklistItemsFromText(' Lock doors \n\nCount the till\nLock doors'), ['Lock doors', 'Count the till']);
    assert.equal(describeWeekdays([1, 2, 3, 4, 5, 6]), 'Mon–Sat');
    assert.equal(describeWeekdays([1, 2, 3, 4, 5, 6, 7]), 'every day');
    assert.equal(describeWeekdays([1, 3, 5]), 'Mon, Wed, Fri');
    assert.equal(formatDueTime('17:00'), '5:00 PM');
    assert.equal(formatDueTime('08:30'), '8:30 AM');
  });

  it('regenerates each template as delegated tasks every morning, once per day, owner-managed', async () => {
    const [migration, corner, component] = await Promise.all([read(migrationPath), read('src/pages/OwnersCorner.tsx'), read('src/components/RecurringChecklists.tsx')]);
    assert.match(migration, /create table if not exists public\.delegated_checklist_templates/);
    assert.match(migration, /weekdays smallint\[\] not null default '\{1,2,3,4,5,6\}'/);
    assert.match(migration, /create or replace function public\.generate_recurring_checklists\(p_day date default null\)/);
    assert.match(migration, /last_generated_on is null or last_generated_on < v_day/);
    assert.match(migration, /task_type, created_by, proof_required\)/);
    assert.match(migration, /cron\.schedule\('spas360-recurring-checklists', '0 10 \* \* \*'/);
    assert.match(migration, /checklist_templates_write[\s\S]*owner_manager/);
    assert.match(corner, /<RecurringChecklists \/>/);
    assert.match(component, /Recurring Checklists/);
    assert.match(component, /rpc\('generate_recurring_checklists'\)/);
    assert.match(component, /Require a photo on each item/);
  });
});
