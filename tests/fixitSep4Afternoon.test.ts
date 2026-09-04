import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Brandon, Sep 4 afternoon cards', () => {
  it('asks for the customer first when creating a job', async () => {
    const service = await read('src/pages/Service.tsx');
    assert.ok(service.indexOf('<CustomerCombobox') < service.indexOf('placeholder="Job Title *"'));
  });

  it('stamps who marked a unit paid off and when', async () => {
    const [migration, hook, component] = await Promise.all([
      read('supabase/migrations/20260904201619_flooring_paid_off_stamp.sql'),
      read('src/hooks/useInventoryFlooringReport.ts'),
      read('src/components/InventoryFlooringStatusReport.tsx'),
    ]);
    assert.match(migration, /add column if not exists report_removed_by uuid/);
    assert.match(migration, /report_removed_at = case when p_value = 'true' then statement_timestamp\(\) else null end/);
    assert.match(migration, /report_removed_by = case when p_value = 'true' then \(select auth\.uid\(\)\) else null end/);
    assert.match(hook, /removed_by:report_removed_by\(first_name, last_name\)/);
    assert.match(hook, /returnedFlooringReport\.report_removed_by === profile\.id[\s\S]*removed_by: \{ first_name: profile\.first_name, last_name: profile\.last_name \}/);
    assert.match(component, /data-paid-off-stamp/);
    assert.match(component, /Paid off \$\{when\}/);
  });

  it('shows every task plus the deals with no task under All Tasks, and frees the dropdown after the tile deep link', async () => {
    const panel = await read('src/components/dashboard/UpcomingTasksPanel.tsx');
    assert.match(panel, /scheduleFilter === ALL_TASKS && \(filteredTasks\.length > 0 \|\| dealsMissingTasks\.length > 0\)/);
    assert.match(panel, />No task scheduled</);
    assert.match(panel, /params\.delete\('tasks'\)/);
    assert.match(panel, /\{ replace: true \}/);
  });
});
