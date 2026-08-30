import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  jobOccursOnCalendarDay,
  jobOverlapsCalendarRange,
  moveJobScheduleToDay,
  scheduleDateRangeError,
} from '../src/lib/jobSchedule.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const localDate = (year: number, month: number, day: number, hour = 12) => new Date(year, month - 1, day, hour);

describe('job schedule date ranges', () => {
  it('keeps null end dates on exactly one calendar day', () => {
    const job = { scheduled_at: localDate(2026, 8, 30, 9).toISOString(), scheduled_end_date: null };
    assert.equal(jobOccursOnCalendarDay(job, localDate(2026, 8, 30)), true);
    assert.equal(jobOccursOnCalendarDay(job, localDate(2026, 8, 31)), false);
  });

  it('renders multi-day jobs on every inclusive selected date', () => {
    const job = { scheduled_at: localDate(2026, 8, 30, 9).toISOString(), scheduled_end_date: '2026-09-02' };
    assert.equal(jobOccursOnCalendarDay(job, localDate(2026, 8, 29)), false);
    assert.equal(jobOccursOnCalendarDay(job, localDate(2026, 8, 30)), true);
    assert.equal(jobOccursOnCalendarDay(job, localDate(2026, 8, 31)), true);
    assert.equal(jobOccursOnCalendarDay(job, localDate(2026, 9, 1)), true);
    assert.equal(jobOccursOnCalendarDay(job, localDate(2026, 9, 2)), true);
    assert.equal(jobOccursOnCalendarDay(job, localDate(2026, 9, 3)), false);
    assert.equal(jobOverlapsCalendarRange(job, localDate(2026, 9, 1, 0), localDate(2026, 9, 30, 23)), true);
  });

  it('rejects an end date without a start and end-before-start', () => {
    assert.equal(scheduleDateRangeError('', ''), null);
    assert.equal(scheduleDateRangeError('', '2026-09-02'), 'Choose a start date before an end date.');
    assert.equal(scheduleDateRangeError('2026-09-03T09:00', '2026-09-02'), 'End date cannot be before start date.');
    assert.equal(scheduleDateRangeError('2026-09-02T09:00', '2026-09-02'), null);
  });

  it('preserves a multi-day span when dragged to another day', () => {
    const moved = moveJobScheduleToDay({
      scheduled_at: localDate(2026, 8, 30, 9).toISOString(),
      scheduled_end_date: '2026-09-02',
    }, '2026-09-10');
    assert.equal(moved.scheduled_end_date, '2026-09-13');
    assert.equal(new Date(moved.scheduled_at!).getHours(), 9);
  });

  it('adds compatible schema and create RPC support', async () => {
    const migration = await read('supabase/migrations/20260830223511_add_job_schedule_end_date.sql');
    assert.match(migration, /add column if not exists scheduled_end_date date/i);
    assert.match(migration, /scheduled_end_date is null[\s\S]*scheduled_at is not null/i);
    assert.match(migration, /scheduled_end_date >= \(scheduled_at at time zone 'America\/Chicago'\)::date/i);
    assert.match(migration, /private\.create_job_with_inventory\([\s\S]*p_scheduled_end_date date/i);
    assert.match(migration, /v_job_id := private\.create_job_with_inventory\([\s\S]*p_inventory_item_id[\s\S]*\);/i);
  });

  it('exposes date ranges on create and existing-job edit paths', async () => {
    const [service, detail] = await Promise.all([
      read('src/pages/Service.tsx'),
      read('src/pages/JobDetail.tsx'),
    ]);
    assert.match(service, /Start date and time/);
    assert.match(service, /End date/);
    assert.match(service, /jobOccursOnCalendarDay\(j, date\)/);
    assert.match(service, /jobOccursOnCalendarDay\(j, day\)/);
    assert.match(detail, /function ScheduleDateRangeEditor/);
    assert.match(detail, /scheduled_end_date: start && end \? end : null/);
  });
});
