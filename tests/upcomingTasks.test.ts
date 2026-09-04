import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  ALL_TASK_OWNERS,
  ALL_TASKS,
  dealsWithoutUpcomingTasks,
  filterTaskOwnerOptions,
  filterUpcomingTasks,
  PAST_DUE_TASKS,
  NO_TASK_SCHEDULED,
  TASKS_DUE_TODAY,
  THRAWN_PROFILE_ID,
  upcomingTaskLink,
  type UpcomingTaskItem,
} from '../src/lib/upcomingTasks.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const tasks: UpcomingTaskItem[] = [
  { id: 'a', title: 'Call Alice', desc: 'Deal follow-up', time: '2h ago', assignedTo: 'owner-a', assignedName: 'Alice Adams', dueAt: '2026-08-25T12:00:00Z', status: 'Pending', dealId: 'deal-a', link: '/deals/deal-a' },
  { id: 'b', title: 'Call Bob', desc: 'Customer follow-up', time: 'In 3h', assignedTo: 'owner-b', assignedName: 'Bob Brown', dueAt: '2026-08-25T18:00:00Z', status: 'In Progress', dealId: 'deal-b', link: '/customers/customer-b' },
];
const completedTask: UpcomingTaskItem = {
  id: 'c', title: 'Completed task', desc: 'General task', time: '2d ago', assignedTo: 'owner-a', assignedName: 'Alice Adams', dueAt: '2026-08-23T12:00:00Z', status: 'Completed', dealId: 'deal-c', link: '/dashboard',
};

describe('Dashboard upcoming tasks', () => {
  it('defaults to the complete task list and filters strictly by assigned owner', () => {
    assert.deepEqual(filterUpcomingTasks(tasks, ALL_TASK_OWNERS), tasks);
    assert.deepEqual(filterUpcomingTasks(tasks, 'owner-a'), [tasks[0]]);
    assert.deepEqual(filterUpcomingTasks(tasks, 'owner-without-tasks'), []);
  });

  it('defines Past Due by due_at before now and incomplete status', () => {
    const now = new Date('2026-08-25T14:00:00Z');
    assert.deepEqual(filterUpcomingTasks([...tasks, completedTask], ALL_TASK_OWNERS, PAST_DUE_TASKS, now), [tasks[0]]);
  });

  it('combines salesperson and due-today filters without repeating overdue tasks', () => {
    const now = new Date('2026-08-25T14:00:00Z');
    assert.deepEqual(filterUpcomingTasks(tasks, 'owner-b', TASKS_DUE_TODAY, now), [tasks[1]]);
    assert.deepEqual(filterUpcomingTasks(tasks, 'owner-a', TASKS_DUE_TODAY, now), []);
    assert.deepEqual(filterUpcomingTasks(tasks, ALL_TASK_OWNERS, TASKS_DUE_TODAY, now), [tasks[1]]);
  });

  it('puts a task due at the current instant in Due Today, not Past Due', () => {
    const now = new Date('2026-08-25T14:00:00Z');
    const dueNow = { ...tasks[0], dueAt: now.toISOString() };
    assert.deepEqual(filterUpcomingTasks([dueNow], ALL_TASK_OWNERS, TASKS_DUE_TODAY, now), [dueNow]);
    assert.deepEqual(filterUpcomingTasks([dueNow], ALL_TASK_OWNERS, PAST_DUE_TASKS, now), []);
  });

  it('removes only the known NDAI Thrawn profile from human owner options', () => {
    const owners = [
      { id: 'owner-a', first_name: 'Alice', last_name: 'Adams' },
      { id: THRAWN_PROFILE_ID, first_name: 'NDAI', last_name: 'Thrawn' },
    ];
    assert.deepEqual(filterTaskOwnerOptions(owners), [owners[0]]);
  });

  it('finds every open deal without an incomplete task due now or later', () => {
    const now = new Date('2026-08-25T14:00:00Z');
    const openDeals = [
      { id: 'deal-a', title: 'Deal A', assignedTo: 'owner-a', assignedName: 'Alice Adams', link: '/deals/deal-a' },
      { id: 'deal-b', title: 'Deal B', assignedTo: 'owner-b', assignedName: 'Bob Brown', link: '/deals/deal-b' },
      { id: 'deal-c', title: 'Deal C', assignedTo: 'owner-a', assignedName: 'Alice Adams', link: '/deals/deal-c' },
    ];
    assert.deepEqual(dealsWithoutUpcomingTasks(openDeals, [...tasks, completedTask], now), [openDeals[0], openDeals[2]]);
  });

  it('links task cards to their real business record', () => {
    assert.equal(upcomingTaskLink({ deal_id: 'deal-a', contact_id: null, job_id: null }), '/deals/deal-a');
    assert.equal(upcomingTaskLink({ deal_id: null, contact_id: 'customer-b', job_id: null }), '/customers/customer-b');
    assert.equal(upcomingTaskLink({ deal_id: null, contact_id: null, job_id: 'job-c' }), '/service/job-c');
    assert.equal(upcomingTaskLink({ deal_id: null, contact_id: null, job_id: null }), '/dashboard');
  });

  it('wires an org-scoped task and owner contract into the ordinary Dashboard', async () => {
    const [dashboard, hook, panel] = await Promise.all([
      read('src/pages/Dashboard.tsx'),
      read('src/hooks/useDashboard.ts'),
      read('src/components/dashboard/UpcomingTasksPanel.tsx'),
    ]);

    assert.match(dashboard, /<UpcomingTasksPanel tasks=\{upcomingTasks\} owners=\{taskOwners\} openDeals=\{openDeals\}/);
    assert.match(panel, />Lead Follow Up Tasks</);
    assert.doesNotMatch(panel, />Upcoming Tasks</);
    assert.match(panel, /<option value=\{ALL_TASK_OWNERS\}>All Sales People<\/option>/);
    assert.match(panel, /<option value=\{ALL_TASKS\}>All Tasks<\/option>/);
    assert.match(panel, /<option value=\{PAST_DUE_TASKS\}>Past Due Tasks<\/option>/);
    assert.match(panel, /<option value=\{TASKS_DUE_TODAY\}>Tasks Due Today<\/option>/);
    assert.match(panel, /<option value=\{NO_TASK_SCHEDULED\}>No Tasks Scheduled<\/option>/);
    assert.match(panel, /filterUpcomingTasks\(tasks, ownerFilter, scheduleFilter, now\)/);
    assert.match(panel, /No upcoming tasks assigned to/);
    assert.match(hook, /from\('tasks'\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*assigned_to/);
    assert.match(hook, /from\('profiles'\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*owner_manager[\s\S]*salesperson/);
    assert.match(hook, /\.neq\('id', THRAWN_PROFILE_ID\)/);
    assert.match(hook, /from\('deals'\)[\s\S]*pipeline_stages!inner\(is_won, is_lost\)[\s\S]*pipeline_stages\.is_won[\s\S]*pipeline_stages\.is_lost/);
  });
});
