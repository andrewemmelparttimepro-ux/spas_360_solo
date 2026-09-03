import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  canAnnotateDelegatedTask,
  canCompleteDelegatedTask,
  canEditDelegatedTask,
  defaultDelegatedView,
  delegatedTaskDueAt,
  filterDelegatedTasks,
  isDelegatedTaskOverdue,
  parseDelegatedRequest,
  splitDelegatedSections,
} from '../src/lib/delegatedTasks.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260903150000_delegated_tasks_v2.sql';

const tasks = [
  { id: 'a', assigned_to: 'alex', created_by: 'brandon', status: 'Pending' as const, due_at: '2026-09-03T21:00:00Z', created_at: '2026-09-03T15:00:00Z', completed_at: null },
  { id: 'b', assigned_to: 'alex', created_by: 'ben', status: 'Completed' as const, due_at: null, created_at: '2026-09-02T15:00:00Z', completed_at: '2026-09-03T16:00:00Z' },
  { id: 'c', assigned_to: 'ben', created_by: 'alex', status: 'Pending' as const, due_at: null, created_at: '2026-09-03T17:00:00Z', completed_at: null },
  { id: 'd', assigned_to: 'alex', created_by: 'brandon', status: 'In Progress' as const, due_at: '2026-09-03T18:00:00Z', created_at: '2026-09-01T15:00:00Z', completed_at: null },
];

describe('Delegated Tasks v2', () => {
  it('turns the "Please Complete" text into a task title plus optional detail', () => {
    assert.deepEqual(parseDelegatedRequest('  Email Bob Johnson a quote for the HM44 Sauna  '), {
      title: 'Email Bob Johnson a quote for the HM44 Sauna',
      description: null,
    });
    assert.deepEqual(parseDelegatedRequest('\nPull the Covana cover\nIt is in the back bay\nLoad it on the trailer'), {
      title: 'Pull the Covana cover',
      description: 'It is in the back bay\nLoad it on the trailer',
    });
    assert.equal(parseDelegatedRequest('   \n  '), null);
    const long = parseDelegatedRequest(`${'word '.repeat(60)}tail`)!;
    assert.ok(long.title.length <= 200);
    assert.ok(long.description?.endsWith('tail'));
  });

  it('keeps the due time optional and stores a given one as an instant', () => {
    assert.equal(delegatedTaskDueAt(''), null);
    assert.equal(delegatedTaskDueAt('not-a-date'), null);
    assert.match(delegatedTaskDueAt('2026-09-03T16:00') ?? '', /^2026-09-03T\d{2}:00:00\.000Z$/);
    assert.equal(isDelegatedTaskOverdue({ status: 'Pending', due_at: null }), false);
    assert.equal(isDelegatedTaskOverdue({ status: 'Pending', due_at: '2026-09-03T18:00:00Z' }, new Date('2026-09-03T19:00:00Z')), true);
    assert.equal(isDelegatedTaskOverdue({ status: 'Completed', due_at: '2026-09-03T18:00:00Z' }, new Date('2026-09-03T19:00:00Z')), false);
  });

  it('shows employees only what is theirs and owners everything', () => {
    assert.equal(defaultDelegatedView('owner_manager'), 'everyone');
    assert.equal(defaultDelegatedView('service_manager'), 'assigned_to_me');
    assert.deepEqual(filterDelegatedTasks(tasks, { view: 'assigned_to_me', userId: 'alex', status: 'incomplete' }).map(t => t.id), ['a', 'd']);
    assert.deepEqual(filterDelegatedTasks(tasks, { view: 'sent_by_me', userId: 'alex', status: 'all' }).map(t => t.id), ['c']);
    assert.deepEqual(filterDelegatedTasks(tasks, { view: 'everyone', userId: 'brandon', assignedTo: 'alex', status: 'completed' }).map(t => t.id), ['b']);
    assert.equal(filterDelegatedTasks(tasks, { view: 'everyone', userId: 'brandon', status: 'all' }).length, 4);
  });

  it('separates incomplete work (soonest due first) from the permanent completed history', () => {
    const sections = splitDelegatedSections(tasks);
    assert.deepEqual(sections.incomplete.map(t => t.id), ['d', 'a', 'c']);
    assert.deepEqual(sections.completed.map(t => t.id), ['b']);
  });

  it('lets only the sender (or an owner) edit or delete, while the assignee completes and annotates', () => {
    const task = tasks[0];
    assert.equal(canEditDelegatedTask(task, { id: 'brandon', role: 'owner_manager' }), true);
    assert.equal(canEditDelegatedTask(task, { id: 'alex', role: 'service_manager' }), false);
    assert.equal(canEditDelegatedTask(tasks[2], { id: 'alex', role: 'service_manager' }), true);
    assert.equal(canCompleteDelegatedTask(task, { id: 'alex', role: 'service_manager' }), true);
    assert.equal(canCompleteDelegatedTask(task, { id: 'ben', role: 'service_manager' }), false);
    assert.equal(canAnnotateDelegatedTask(task, { id: 'alex', role: 'technician' }), true);
    assert.equal(canAnnotateDelegatedTask(task, { id: 'ben', role: 'service_manager' }), false);
  });

  it('keeps Delegated Tasks above Revenue Overview and on the technician schedule', async () => {
    const [dashboard, service] = await Promise.all([read('src/pages/Dashboard.tsx'), read('src/pages/Service.tsx')]);
    const delegatedPanelIndex = dashboard.indexOf('<DelegatedTasksPanel />');
    assert.ok(delegatedPanelIndex > 0);
    assert.ok(dashboard.indexOf('Revenue Overview') > delegatedPanelIndex);
    assert.match(service, /\{technician && \([\s\S]*?<DelegatedTasksPanel \/>/);
  });

  it('wires Brandon\'s wording and rules into the panel', async () => {
    const [panel, hook] = await Promise.all([
      read('src/components/dashboard/DelegatedTasksPanel.tsx'),
      read('src/hooks/useDelegatedTasks.ts'),
    ]);
    assert.match(panel, />Delegated Tasks</);
    assert.match(panel, /Please Complete/);
    assert.match(panel, /Due date and time \(optional\)/);
    assert.match(panel, /DELEGATED_STATUS_LABELS\.incomplete/);
    assert.doesNotMatch(panel, /Not Completed/);
    assert.match(panel, /aria-label="Incomplete delegated tasks"/);
    assert.match(panel, /aria-label="Completed delegated tasks"/);
    assert.match(panel, /Completed tasks stay here as history/);
    assert.match(panel, /canEditDelegatedTask\(task, viewer\)/);
    assert.match(panel, /Delete this task\?/);
    assert.match(panel, /params\.get\('delegated'\)/);
    assert.match(hook, /task_type: DELEGATED_TASK_TYPE/);
    assert.match(hook, /sender:created_by\(id, first_name, last_name, role\)/);
    assert.match(hook, /\.delete\(\{ count: 'exact' \}\)/);
    assert.match(hook, /export async function fetchMyIncompleteDelegatedTasks/);
  });

  it('opens delegation to every teammate with sender-only edits, optional due time, and notifications in the database', async () => {
    const migration = await read(migrationPath);
    assert.match(migration, /alter column due_at drop not null/);
    assert.match(migration, /due_at is not null or task_type = 'Delegated'/);
    assert.match(migration, /create policy task_insert[\s\S]*task_type = 'Delegated'\n    or \(/);
    assert.match(migration, /create policy task_read[\s\S]*or created_by = \(select auth\.uid\(\)\)/);
    assert.match(migration, /create policy task_delete[\s\S]*task_type = 'Delegated'[\s\S]*created_by = \(select auth\.uid\(\)\)/);
    assert.match(migration, /Only the person who sent this task \(or an owner\) can change it/);
    assert.match(migration, /Delegated task authorship cannot be changed/);
    assert.match(migration, /new\.completed_at := clock_timestamp\(\)/);
    assert.match(migration, /create trigger notify_delegated_task/);
    assert.match(migration, /'New task from ' \|\| coalesce\(v_sender/);
    assert.match(migration, /completed: ' \|\| left\(new\.title, 120\)/);
    assert.match(migration, /create policy profile_read on public\.profiles[\s\S]*using \(org_id = \(select public\.auth_org\(\)\)\)/);
    assert.doesNotMatch(migration, /grant .* to anon/i);
  });
});
