import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { calendarJobTitleClass } from '../src/lib/jobSchedule.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('completed jobs on the Schedule calendar', () => {
  it('uses a solid strike only for Completed job titles', () => {
    assert.equal(calendarJobTitleClass('Completed'), 'line-through decoration-solid decoration-2');
    assert.equal(calendarJobTitleClass('In Progress'), undefined);
    assert.equal(calendarJobTitleClass('Delivery'), undefined);
    assert.equal(calendarJobTitleClass('Cancelled'), undefined);
  });

  it('covers the shared day and week calendar card title', async () => {
    const service = await read('src/pages/Service.tsx');
    const jobCard = service.slice(service.indexOf('function JobCard'), service.indexOf('export default function Service'));
    const dayView = service.slice(service.indexOf("viewMode === 'day'"), service.indexOf('{/* ─── WEEK'));
    const weekView = service.slice(service.indexOf("viewMode === 'week'"), service.indexOf('{/* ─── MONTH'));

    assert.match(jobCard, /<h3 className=\{cn\([\s\S]*calendarJobTitleClass\(job\.status\)/);
    assert.match(dayView, /<JobCard job=\{job\}/);
    assert.match(weekView, /<JobCard job=\{job\}/);
  });

  it('strikes the month title without replacing job-type color or drag bindings', async () => {
    const service = await read('src/pages/Service.tsx');
    const monthView = service.slice(service.indexOf("viewMode === 'month'"), service.indexOf('{/* ─── Unscheduled queue'));

    assert.match(monthView, /jobTypeChipColors\[scheduleJobType\(job\.job_type\)\]/);
    assert.match(monthView, /<span className=\{calendarJobTitleClass\(job\.status\)\}>\{job\.title\}<\/span>/);
    assert.match(monthView, /draggableId=\{scheduledDraggableId\(job\.id, day\)\}/);
  });

  it('does not apply the calendar strike helper to the unscheduled queue', async () => {
    const service = await read('src/pages/Service.tsx');
    const queue = service.slice(service.indexOf('{/* ─── Unscheduled queue'));

    assert.match(queue, /\{job\.title\}/);
    assert.doesNotMatch(queue, /calendarJobTitleClass/);
  });
});
