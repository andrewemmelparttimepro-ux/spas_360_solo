import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countScheduledJobs, dashboardScheduleLink, dealershipDate, loadSchedulePages, parseDashboardScheduleFilter, scheduleCalendarDate, scheduleDayBounds, scheduledJobsForDay, TODAY_JOB_TYPES, type ScheduleCountJob } from '../src/lib/dashboardSchedule.ts';
import { jobOverlapsCalendarRange, scheduleJobType } from '../src/lib/jobSchedule.ts';

const job = (id: string, changes: Partial<ScheduleCountJob> = {}): ScheduleCountJob => ({
  id, job_type: 'Service', status: 'In Progress', scheduled_at: '2026-09-07T18:00:00Z', scheduled_end_date: null, ...changes,
});

describe('dashboard scheduled today', () => {
  it('counts every requested type across stores, normalizes legacy types, and includes completed jobs', () => {
    const rows = [
      { ...job('minot'), location_id: 'minot' },
      { ...job('bismarck'), location_id: 'bismarck' },
      job('repair', { job_type: 'Repair' }), job('install', { job_type: 'Installation' }),
      job('maintenance', { job_type: 'Maintenance', status: 'Completed' }),
      job('delivery', { job_type: 'Delivery' }), job('warranty', { job_type: 'Warranty' }),
      job('pickup', { job_type: 'Pickup' }), job('modern-pickup', { job_type: 'Customer Pick Up' }),
      job('order', { job_type: 'On Order' }), job('todo', { job_type: 'To Do' }),
      job('cancelled', { status: 'Cancelled' }), job('unscheduled', { scheduled_at: null }),
      job('tomorrow', { scheduled_at: '2026-09-08T05:00:00Z' }),
    ];
    assert.deepEqual(countScheduledJobs(rows, '2026-09-07'), {
      Service: 5, Delivery: 1, Warranty: 1, 'Customer Pick Up': 2, 'On Order': 1, 'To Do': 1,
    });
    const day = scheduleCalendarDate('2026-09-07')!;
    for (const type of TODAY_JOB_TYPES) {
      const calendarRows = rows.filter(row => row.status !== 'Cancelled' && scheduleJobType(row.job_type) === type && jobOverlapsCalendarRange(row, day, day));
      assert.equal(countScheduledJobs(rows, '2026-09-07')[type], calendarRows.length);
      assert.deepEqual(scheduledJobsForDay(rows, '2026-09-07', [type]), calendarRows);
    }
  });

  it('includes all-day and timed multi-day spans through their inclusive final date', () => {
    const rows = [
      job('all-day', { scheduled_at: '2026-09-05T18:00:00Z', scheduled_end_date: '2026-09-07' }),
      job('timed', { scheduled_at: '2026-09-07T04:59:59Z', scheduled_end_date: '2026-09-09' }),
      job('expired', { scheduled_at: '2026-09-05T18:00:00Z', scheduled_end_date: '2026-09-06' }),
      job('just-before', { scheduled_at: '2026-09-07T04:59:59Z' }),
      job('midnight', { scheduled_at: '2026-09-07T05:00:00Z' }),
      job('last-second', { scheduled_at: '2026-09-08T04:59:59Z' }),
    ];
    assert.deepEqual(scheduledJobsForDay(rows, '2026-09-07').map(row => row.id), ['all-day', 'timed', 'midnight', 'last-second']);
    assert.deepEqual(scheduledJobsForDay(rows, '2026-09-08').map(row => row.id), ['timed']);
  });

  it('uses the Central date across midnight and CST/CDT independent of the process timezone', () => {
    assert.equal(dealershipDate(new Date('2026-09-07T04:59:59.999Z')), '2026-09-06');
    assert.equal(dealershipDate(new Date('2026-09-07T05:00:00.000Z')), '2026-09-07');
    assert.equal(dealershipDate(new Date('2026-12-07T05:59:59.999Z')), '2026-12-06');
    assert.equal(dealershipDate(new Date('2026-12-07T06:00:00.000Z')), '2026-12-07');
    assert.deepEqual(scheduleDayBounds('2026-09-07'), { start: '2026-09-07T05:00:00.000Z', end: '2026-09-08T05:00:00.000Z' });
    assert.deepEqual(scheduleDayBounds('2026-12-07'), { start: '2026-12-07T06:00:00.000Z', end: '2026-12-08T06:00:00.000Z' });
    assert.deepEqual(scheduleDayBounds('2026-03-08'), { start: '2026-03-08T06:00:00.000Z', end: '2026-03-09T05:00:00.000Z' });
    assert.deepEqual(scheduleDayBounds('2026-11-01'), { start: '2026-11-01T05:00:00.000Z', end: '2026-11-02T06:00:00.000Z' });
  });

  it('round-trips all-store day/type filters through a reloadable URL and supports calendar controls', () => {
    for (const type of TODAY_JOB_TYPES) {
      const filter = { date: '2026-09-07', types: [type], view: 'day' as const };
      const url = dashboardScheduleLink(filter);
      assert.deepEqual(parseDashboardScheduleFilter(new URL(url, 'https://example.test').search), filter);
    }
    const changed = { date: '2026-09-08', types: ['Service', 'Delivery'] as const, view: 'week' as const };
    assert.deepEqual(parseDashboardScheduleFilter(dashboardScheduleLink({ ...changed, types: [...changed.types] }).split('?')[1]), changed);
    assert.deepEqual(parseDashboardScheduleFilter('?date=2026-09-07&view=day&stores=all'), { date: '2026-09-07', types: [], view: 'day' });
  });

  it('rejects malformed or incomplete drill-down dates, types, views and store scope', () => {
    for (const search of [
      '?date=2026-02-30&view=day&stores=all&type=Service',
      '?date=2026-9-7&view=day&stores=all&type=Service',
      '?date=not-a-date&view=day&stores=all&type=Service',
      '?date=2026-09-07&view=day&stores=all&type=Repair',
      '?date=2026-09-07&view=day&stores=all&type=Service&type=unknown',
      '?date=2026-09-07&view=list&stores=all&type=Service',
      '?date=2026-09-07&view=day&stores=minot&type=Service',
      '?date=2026-09-07&stores=all&type=Service',
    ]) assert.equal(parseDashboardScheduleFilter(search), null, search);
  });
});

describe('complete schedule pagination', () => {
  it('reads more than 1,000 rows and continues at an exact page boundary', async () => {
    const input = Array.from({ length: 1500 }, (_, i) => job(String(i)));
    const calls: number[] = [];
    const output = await loadSchedulePages(async (offset, pageSize) => {
      calls.push(offset);
      return { data: input.slice(offset, offset + pageSize), error: null };
    });
    assert.deepEqual(calls, [0, 500, 1000, 1500]);
    assert.deepEqual(output, input);
    assert.equal(countScheduledJobs(output, '2026-09-07').Service, 1500);
  });

  it('continues through a provider cap lower than the requested page size', async () => {
    const input = Array.from({ length: 601 }, (_, i) => i);
    const calls: number[] = [];
    const output = await loadSchedulePages(async offset => {
      calls.push(offset);
      return { data: input.slice(offset, offset + 200), error: null };
    });
    assert.deepEqual(calls, [0, 200, 400, 600, 601]);
    assert.deepEqual(output, input);
  });

  it('rejects a partial read on a later page instead of publishing a smaller count', async () => {
    await assert.rejects(loadSchedulePages(async offset => offset === 0
      ? { data: [job('one')], error: null }
      : { data: null, error: { message: 'Network failure' } }), /Network failure/);
    await assert.rejects(loadSchedulePages(async () => ({ data: null, error: null })), /Schedule response was empty/);
    assert.deepEqual(await loadSchedulePages(async () => ({ data: [], error: null })), []);
  });
});
