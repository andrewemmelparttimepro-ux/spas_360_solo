import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  jobScheduleDraft,
  jobScheduleUpdatesFromDraft,
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
    assert.equal(scheduleDateRangeError('2026-09-03', '2026-09-02'), 'End date cannot be before start date.');
    assert.equal(scheduleDateRangeError('2026-09-02', '2026-09-02'), null);
  });

  it('stores a date-only job with an explicit marker and no visible time', () => {
    const update = jobScheduleUpdatesFromDraft('2026-12-15', '', '');
    assert.deepEqual(update, {
      scheduled_at: '2026-12-15T18:00:00.000Z',
      scheduled_all_day: true,
      scheduled_end_date: null,
    });
    assert.deepEqual(jobScheduleDraft(update), {
      startDate: '2026-12-15',
      startTime: '',
      endDate: '',
    });
  });

  it('preserves an explicitly supplied Central time independently of the browser timezone', () => {
    const summer = jobScheduleUpdatesFromDraft('2026-08-30', '09:15', '2026-09-02');
    assert.equal(summer.scheduled_at, '2026-08-30T14:15:00.000Z');
    assert.equal(summer.scheduled_all_day, false);
    assert.deepEqual(jobScheduleDraft(summer), {
      startDate: '2026-08-30',
      startTime: '09:15',
      endDate: '2026-09-02',
    });

    const winterNoon = jobScheduleUpdatesFromDraft('2026-12-15', '12:00', '');
    const dateOnly = jobScheduleUpdatesFromDraft('2026-12-15', '', '');
    assert.equal(winterNoon.scheduled_at, dateOnly.scheduled_at);
    assert.equal(winterNoon.scheduled_all_day, false);
    assert.equal(dateOnly.scheduled_all_day, true);
  });

  it('preserves a multi-day span when dragged to another day', () => {
    const moved = moveJobScheduleToDay({
      scheduled_at: localDate(2026, 8, 30, 9).toISOString(),
      scheduled_all_day: false,
      scheduled_end_date: '2026-09-02',
    }, '2026-09-10');
    assert.equal(moved.scheduled_end_date, '2026-09-13');
    assert.equal(new Date(moved.scheduled_at!).getHours(), 9);
    assert.equal(moved.scheduled_all_day, false);
  });

  it('makes an unscheduled drag date-only and preserves date-only multi-day spans', () => {
    const newlyScheduled = moveJobScheduleToDay({
      scheduled_at: null,
      scheduled_all_day: false,
      scheduled_end_date: null,
    }, '2026-09-10');
    assert.equal(newlyScheduled.scheduled_all_day, true);
    assert.deepEqual(jobScheduleDraft(newlyScheduled), {
      startDate: '2026-09-10',
      startTime: '',
      endDate: '',
    });

    const moved = moveJobScheduleToDay({
      scheduled_at: '2026-08-30T18:00:00.000Z',
      scheduled_all_day: true,
      scheduled_end_date: '2026-09-02',
    }, '2026-09-10');
    assert.equal(moved.scheduled_all_day, true);
    assert.equal(moved.scheduled_end_date, '2026-09-13');
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
    assert.match(service, /Start date/);
    assert.match(service, /new-job-scheduled-time[^]*Time[^]*\(optional\)/);
    assert.match(service, /End date/);
    assert.match(service, /jobOccursOnCalendarDay\(j, date\)/);
    assert.match(service, /jobOccursOnCalendarDay\(j, day\)/);
    assert.match(detail, /function ScheduleDateRangeEditor/);
    assert.match(detail, /jobScheduleUpdatesFromDraft\(startDate, startTime, endDate\)/);
  });

  it('adds an explicit all-day flag and an RPC overload without rewriting existing timed rows', async () => {
    const migration = await read('supabase/migrations/20260831001731_add_optional_job_schedule_time.sql');
    assert.match(migration, /add column if not exists scheduled_all_day boolean/i);
    assert.match(migration, /set scheduled_all_day = false[\s\S]*where scheduled_all_day is null/i);
    assert.match(migration, /alter column scheduled_all_day set not null/i);
    assert.match(migration, /private\.create_job_with_inventory\([\s\S]*p_scheduled_all_day boolean/i);
    assert.match(migration, /set scheduled_all_day = coalesce\(p_scheduled_all_day, false\)/i);
  });
});
