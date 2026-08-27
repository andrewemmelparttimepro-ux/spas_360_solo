import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { customerCityFromAddress, JOB_TYPE_OPTIONS, scheduleJobType, unscheduledJobStatusLabel, unscheduledJobVisualStatus } from '../src/lib/jobSchedule.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Schedule job language and colors', () => {
  it('offers exactly the five requested job types in customer-facing order', () => {
    assert.deepEqual(JOB_TYPE_OPTIONS, ['Service', 'Warranty', 'Delivery', 'On Order', 'Customer Pick Up']);
  });

  it('derives the city from common stored mailing-address shapes', () => {
    assert.equal(customerCityFromAddress('123 Main St, Bismarck, ND 58501'), 'Bismarck');
    assert.equal(customerCityFromAddress('456 North Ave\nMinot, ND 58701'), 'Minot');
    assert.equal(customerCityFromAddress(null), null);
  });

  it('keeps legacy job meaning while grouping it into the new color language', () => {
    assert.equal(scheduleJobType('Repair'), 'Service');
    assert.equal(scheduleJobType('Installation'), 'Service');
    assert.equal(scheduleJobType('Maintenance'), 'Service');
    assert.equal(scheduleJobType('Pickup'), 'Customer Pick Up');
  });

  it('labels parts waiting in the unscheduled queue as On Order', () => {
    assert.equal(unscheduledJobStatusLabel('Parts on Order'), 'On Order');
    assert.equal(unscheduledJobStatusLabel('In Progress'), 'Service');
  });

  it('classifies unscheduled fill from status even when job type and title say Delivery', () => {
    assert.equal(unscheduledJobVisualStatus({
      status: 'Warranty',
      job_type: 'Delivery',
      title: 'Customer – Hot Tub – Delivery',
    }), 'Warranty');
  });

  it('keeps scheduled fill keyed to the stored job type', () => {
    const job = {
      job_type: 'Warranty',
      status: 'Delivery',
      title: 'Delivery inspection for customer spa',
    } as const;
    assert.equal(scheduleJobType(job.job_type), 'Warranty');
  });

  it('uses status colors for the queue and job-type colors for scheduled views', async () => {
    const hook = await read('src/hooks/useServiceJobs.ts');
    const service = await read('src/pages/Service.tsx');
    const queueColors = hook.slice(
      hook.indexOf('export const statusChipColors'),
      hook.indexOf('// Legend dots'),
    );
    assert.match(queueColors, /'Delivery': 'bg-red-600 text-white'/);
    assert.match(queueColors, /'Warranty': 'bg-purple-600 text-white'/);
    assert.match(queueColors, /'Parts on Order': 'bg-black text-white/);
    assert.match(queueColors, /'In Progress': 'bg-brand-500 text-white'/);
    assert.match(queueColors, /'Ready for Pickup': 'bg-emerald-600 text-white'/);
    assert.match(hook, /'Service': 'bg-brand-500 text-white'/);
    assert.match(hook, /'Delivery': 'bg-red-600 text-white'/);
    assert.match(hook, /'Warranty': 'bg-purple-600 text-white'/);
    assert.match(hook, /'Customer Pick Up': 'bg-emerald-600 text-white'/);
    assert.match(hook, /'On Order': 'bg-black text-white/);
    assert.match(service, /jobTypeChipColors\[scheduleJobType\(job\.job_type\)\]/);
    assert.match(service, /jobTypeCardColors\[scheduleJobType\(job\.job_type\)\]/);
    assert.match(service, /statusChipColors\[unscheduledJobVisualStatus\(job\)\]/);
    assert.match(service, /light \? unscheduledJobStatusLabel\(value\) : value/);
    assert.match(service, /updateJob\(jobId, \{ scheduled_at:/);
    assert.match(service, /<Link to=\{`\/service\/\$\{job\.id\}`\}/);
  });

  it('shows the five job-type legend filters without numeric counts', async () => {
    const hook = await read('src/hooks/useServiceJobs.ts');
    const service = await read('src/pages/Service.tsx');
    assert.match(service, /const LEGEND_JOB_TYPES: ScheduleJobType\[\] = \['Service', 'Delivery', 'Warranty', 'Customer Pick Up', 'On Order'\]/);
    assert.match(service, /LEGEND_JOB_TYPES\.map\(jobType =>/);
    assert.match(service, /jobTypeDotColors\[jobType\]/);
    assert.match(service, /jobTypeFilter\.has\(scheduleJobType\(j\.job_type\)\)/);
    assert.doesNotMatch(service, /legendCounts/);
    assert.match(hook, /'Service': 'bg-brand-400'/);
    assert.match(hook, /'Delivery': 'bg-red-500'/);
    assert.match(hook, /'Warranty': 'bg-purple-500'/);
    assert.match(hook, /'Customer Pick Up': 'bg-emerald-500'/);
    assert.match(hook, /'On Order': 'bg-black ring-1 ring-ink-500'/);
  });

  it('uses purple for every Warranty treatment without recoloring other job types', async () => {
    const hook = await read('src/hooks/useServiceJobs.ts');
    const css = await read('src/index.css');

    assert.equal((hook.match(/'Warranty': '[^']*purple[^']*'/g) ?? []).length, 6);
    assert.doesNotMatch(hook, /'Warranty': '[^']*orange[^']*'/);
    assert.match(hook, /'Service': 'bg-brand-500 text-white'/);
    assert.match(hook, /'Delivery': 'bg-red-600 text-white'/);
    assert.match(hook, /'Customer Pick Up': 'bg-emerald-600 text-white'/);
    assert.match(hook, /'On Order': 'bg-black text-white/);
    assert.match(css, /\.app-main \.schedule-calendar \.text-purple-200\s*\{\s*color:\s*var\(--color-purple-200\) !important;/i);
  });

  it('preserves legacy rows and labels won deliveries with customer and city', async () => {
    const migration = await read('supabase/migrations/20260826193215_align_schedule_job_types.sql');
    assert.doesNotMatch(migration, /update public\.jobs/);
    assert.match(migration, /'Repair', 'Installation', 'Maintenance', 'Pickup'/);
    assert.match(migration, /v_job_title := coalesce[\s\S]*v_customer_city[\s\S]*v_job_title \|\| ' – Delivery'/);
    assert.match(migration, /'Delivery', 'Delivery'/);
  });
});
