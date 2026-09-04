import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Brandon, Sep 4: Overdue Tasks tile and job Collect header', () => {
  it('replaces Overdue Parts with a live Overdue Tasks count that opens the past-due list', async () => {
    const [dashboard, panel] = await Promise.all([read('src/pages/Dashboard.tsx'), read('src/components/dashboard/UpcomingTasksPanel.tsx')]);
    assert.doesNotMatch(dashboard, /Overdue Parts/);
    assert.match(dashboard, /title: 'Overdue Tasks'/);
    assert.match(dashboard, /link: '\/dashboard\?tasks=past-due'/);
    assert.match(dashboard, /new Date\(task\.dueAt\)\.getTime\(\) < Date\.now\(\)/);
    assert.match(panel, /params\.get\('tasks'\) !== 'past-due'/);
    assert.match(panel, /setScheduleFilter\(PAST_DUE_TASKS\)/);
    assert.match(panel, /id="lead-follow-up-tasks-heading"/);
  });

  it('labels the collect amount and drops the service-level wrench from the job page', async () => {
    const detail = await read('src/pages/JobDetail.tsx');
    assert.match(detail, />Collect<\/h3>/);
    assert.doesNotMatch(detail, /Service Level \(1–3\)/);
    assert.doesNotMatch(detail, /field="service_level"/);
  });
});
