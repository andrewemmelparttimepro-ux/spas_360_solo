import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  ALL_TASK_OWNERS,
  filterUpcomingTasks,
  upcomingTaskLink,
  type UpcomingTaskItem,
} from '../src/lib/upcomingTasks.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const tasks: UpcomingTaskItem[] = [
  { id: 'a', title: 'Call Alice', desc: 'Deal follow-up', time: 'In 2h', assignedTo: 'owner-a', assignedName: 'Alice Adams', link: '/deals/deal-a' },
  { id: 'b', title: 'Call Bob', desc: 'Customer follow-up', time: 'In 3h', assignedTo: 'owner-b', assignedName: 'Bob Brown', link: '/customers/customer-b' },
];

describe('Dashboard upcoming tasks', () => {
  it('defaults to the complete task list and filters strictly by assigned owner', () => {
    assert.deepEqual(filterUpcomingTasks(tasks, ALL_TASK_OWNERS), tasks);
    assert.deepEqual(filterUpcomingTasks(tasks, 'owner-a'), [tasks[0]]);
    assert.deepEqual(filterUpcomingTasks(tasks, 'owner-without-tasks'), []);
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

    assert.match(dashboard, /<UpcomingTasksPanel tasks=\{upcomingTasks\} owners=\{taskOwners\}/);
    assert.match(panel, />Upcoming Tasks</);
    assert.match(panel, /<option value=\{ALL_TASK_OWNERS\}>All Tasks<\/option>/);
    assert.match(panel, /filterUpcomingTasks\(tasks, ownerFilter\)/);
    assert.match(panel, /No upcoming tasks assigned to/);
    assert.match(hook, /from\('tasks'\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*assigned_to/);
    assert.match(hook, /from\('profiles'\)[\s\S]*\.eq\('org_id', profile\.org_id\)[\s\S]*owner_manager[\s\S]*salesperson/);
  });
});
