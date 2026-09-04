import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { isCompletedLateFollowUp } from '../src/lib/followUpTaskHistory.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260904190000_preserve_late_follow_up_history.sql';

describe('Late lead follow-up history', () => {
  it('uses only the immutable database marker, never the current due date', () => {
    assert.equal(isCompletedLateFollowUp({
      status: 'Completed',
      was_overdue_at_completion: true,
      overdue_due_at: '2026-09-04T14:00:00Z',
    }), true);
    assert.equal(isCompletedLateFollowUp({
      status: 'Completed',
      was_overdue_at_completion: false,
      overdue_due_at: null,
    }), false);
    assert.equal(isCompletedLateFollowUp({
      status: 'Pending',
      was_overdue_at_completion: true,
      overdue_due_at: '2026-09-04T14:00:00Z',
    }), false);
  });

  it('database-authors the missed fact from the pre-completion task and locks it forever', async () => {
    const migration = await read(migrationPath);
    assert.match(migration, /old\.task_type in \('Follow-up', 'Sales Follow-Up'\)/);
    assert.match(migration, /old\.due_at < v_completed_at/);
    assert.match(migration, /new\.overdue_due_at := old\.due_at/);
    assert.match(migration, /if old\.was_overdue_at_completion then[\s\S]*Completed late follow-up history cannot be changed/);
    assert.match(migration, /if tg_op = 'DELETE' then[\s\S]*Completed late follow-up history cannot be deleted/);
    assert.match(migration, /before insert or update or delete on public\.tasks/);
    assert.match(migration, /update public\.tasks[\s\S]*completed_at > due_at[\s\S]*task_type in \('Follow-up', 'Sales Follow-Up'\)/i);
    assert.match(migration, /Completed rows with no completed_at are intentionally not backfilled/);
  });

  it('renders late history red and locked on the ordinary Deal Detail route', async () => {
    const dealDetail = await read('src/pages/DealDetail.tsx');
    assert.match(dealDetail, /completedLate \? 'border-red-500\/50 bg-red-500\/10'/);
    assert.match(dealDetail, /Missed deadline · Due/);
    assert.match(dealDetail, /Completed late/);
    assert.match(dealDetail, /Permanent missed-task history/);
    assert.match(dealDetail, /disabled=\{completed\}/);
  });
});
