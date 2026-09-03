import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  checklistItems,
  delegatedTaskDueAt,
  filterDelegatedTasks,
} from '../src/lib/delegatedTasks.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260903015757_delegated_dashboard_tasks.sql';

describe('Dashboard delegated tasks', () => {
  it('turns one-item-per-line owner input into a deduplicated checklist', () => {
    assert.deepEqual(
      checklistItems(' Confirm delivery window \n\nCall customer\nConfirm delivery window '),
      ['Confirm delivery window', 'Call customer'],
    );
  });

  it('filters independently by staff and Completed/Not Completed', () => {
    const tasks = [
      { id: 'a', assigned_to: 'staff-a', status: 'Pending' as const },
      { id: 'b', assigned_to: 'staff-a', status: 'Completed' as const },
      { id: 'c', assigned_to: 'staff-b', status: 'In Progress' as const },
    ];
    assert.deepEqual(filterDelegatedTasks(tasks, 'staff-a', 'not_completed'), [tasks[0]]);
    assert.deepEqual(filterDelegatedTasks(tasks, '', 'completed'), [tasks[1]]);
    assert.deepEqual(filterDelegatedTasks(tasks, 'staff-b', 'all'), [tasks[2]]);
  });

  it('requires a valid local due date and time and persists it as an instant', () => {
    assert.equal(delegatedTaskDueAt(''), null);
    assert.equal(delegatedTaskDueAt('not-a-date'), null);
    assert.match(delegatedTaskDueAt('2026-09-03T14:30') ?? '', /^2026-09-03T\d{2}:30:00\.000Z$/);
  });

  it('places the Delegated Tasks section before Revenue Overview on the ordinary dashboard', async () => {
    const dashboard = await read('src/pages/Dashboard.tsx');
    const delegatedPanelIndex = dashboard.indexOf('<DelegatedTasksPanel />');
    const revenueIndex = dashboard.indexOf('Revenue Overview');
    assert.ok(delegatedPanelIndex > 0);
    assert.ok(revenueIndex > delegatedPanelIndex);
  });

  it('wires owner creation, staff/status filters, assignee notes, completion, and realtime refresh', async () => {
    const [panel, hook, service] = await Promise.all([
      read('src/components/dashboard/DelegatedTasksPanel.tsx'),
      read('src/hooks/useDelegatedTasks.ts'),
      read('src/pages/Service.tsx'),
    ]);

    assert.match(panel, />Delegated Tasks</);
    assert.match(panel, /profile\?\.role === 'owner_manager'/);
    assert.match(panel, /type="datetime-local"/);
    assert.match(panel, />Not Completed</);
    assert.match(panel, />Completed</);
    assert.match(panel, /Assignee notes/);
    assert.match(panel, /task\.assigned_to === profile\?\.id/);
    assert.match(hook, /\.eq\('task_type', DELEGATED_TASK_TYPE\)/);
    assert.match(hook, /task_type: DELEGATED_TASK_TYPE/);
    assert.match(hook, /'owner_manager', 'service_manager', 'salesperson', 'technician'/);
    assert.match(hook, /\.neq\('id', THRAWN_PROFILE_ID\)/);
    assert.match(hook, /postgres_changes/);
    assert.match(hook, /assignee_notes/);
    assert.match(hook, /status\?: TaskStatus/);
    assert.match(service, /import DelegatedTasksPanel from '@\/components\/dashboard\/DelegatedTasksPanel'/);
    assert.match(service, /\{technician && \([\s\S]*?<DelegatedTasksPanel \/>/);
  });

  it('adds durable completion/notes with explicit grants, RLS, owner authorship, and assignee-safe mutation', async () => {
    const migration = await read(migrationPath);

    assert.match(migration, /add column if not exists assignee_notes text/);
    assert.match(migration, /add column if not exists completed_at timestamptz/);
    assert.match(migration, /new\.completed_at := clock_timestamp\(\)/);
    assert.match(migration, /alter table public\.tasks enable row level security/);
    assert.match(migration, /create policy task_insert[\s\S]*task_type is distinct from 'Delegated'[\s\S]*public\.auth_role\(\)\) = 'owner_manager'/);
    assert.match(migration, /assignee\.org_id = \(select public\.auth_org\(\)\)/);
    assert.match(migration, /drop policy if exists technician_office_block on public\.tasks/);
    assert.match(migration, /create policy task_read[\s\S]*task_type = 'Delegated'[\s\S]*assigned_to = \(select auth\.uid\(\)\)/);
    assert.match(migration, /create policy task_update[\s\S]*task_type = 'Delegated'[\s\S]*public\.auth_role\(\)\) = 'owner_manager'/);
    assert.match(migration, /task_type is distinct from 'Delegated'[\s\S]*public\.auth_role\(\)\) <> 'technician'/);
    assert.match(migration, /Only an owner can change a delegated task assignment or definition/);
    assert.match(migration, /old\.task_type = 'Delegated' or new\.task_type = 'Delegated'/);
    assert.match(migration, /grant select, insert, update, delete on table public\.tasks to authenticated/);
    assert.match(migration, /alter publication supabase_realtime add table public\.tasks/);
    assert.doesNotMatch(migration, /grant .* to anon/i);
  });
});
