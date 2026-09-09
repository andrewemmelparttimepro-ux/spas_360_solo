import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  JOB_DETAIL_STATUS_OPTIONS,
  jobDetailStatus,
  jobDetailScheduledDate,
  jobDetailStatusUpdates,
  jobScheduleUpdatesFromDraft,
} from '../src/lib/jobSchedule.ts';
import type { JobStatus, JobType } from '../src/types/database.ts';

const schedule = jobScheduleUpdatesFromDraft('2026-09-04', '', '2026-09-06');
const activeStatuses: JobStatus[] = [
  'Pending Confirm', 'Delivery', 'Parts on Order', 'Warranty', 'Ready for Pickup', 'In Progress',
];

describe('job detail schedule status', () => {
  it('offers exactly the three requested header states', () => {
    assert.deepEqual(JOB_DETAIL_STATUS_OPTIONS, ['Unscheduled', 'Scheduled', 'Completed']);
  });

  it('maps every active workflow to the actual schedule and lets completion take precedence', () => {
    for (const status of activeStatuses) {
      assert.equal(jobDetailStatus({ status, scheduled_at: null }), 'Unscheduled');
      assert.equal(jobDetailStatus({ status, ...schedule }), 'Scheduled');
    }
    assert.equal(jobDetailStatus({ status: 'Completed', ...schedule }), 'Completed');
    assert.equal(jobDetailStatus({ status: 'Completed', scheduled_at: null }), 'Completed');
    assert.equal(jobDetailStatus({ status: 'In Progress', scheduled_at: 'invalid' }), 'Unscheduled');
  });

  it('shows the same Central calendar day for date-only, timed, and UTC-boundary jobs', () => {
    assert.equal(jobDetailScheduledDate({ status: 'Parts on Order', ...schedule }), 'Sep 4, 2026');
    assert.equal(jobDetailScheduledDate({ status: 'Delivery', scheduled_at: '2026-09-05T02:00:00Z' }), 'Sep 4, 2026');
    assert.equal(jobDetailScheduledDate({ status: 'Delivery', scheduled_at: '2026-12-16T02:00:00Z' }), 'Dec 15, 2026');
    assert.equal(jobDetailScheduledDate({ status: 'Completed', ...schedule }), null);
    assert.equal(jobDetailScheduledDate({ status: 'Delivery', scheduled_at: null }), null);
  });

  it('does not overwrite any active workflow when scheduling or unscheduling', () => {
    for (const status of activeStatuses) {
      const job = { status, job_type: 'Delivery' as const };
      assert.deepEqual(jobDetailStatusUpdates(job, 'Scheduled', schedule), schedule);
      assert.deepEqual(jobDetailStatusUpdates(job, 'Unscheduled'), {
        scheduled_at: null, scheduled_all_day: false, scheduled_end_date: null,
      });
    }
  });

  it('refuses Scheduled without a valid saved calendar date', () => {
    const job = { status: 'Parts on Order', job_type: 'Delivery' } as const;
    assert.throws(() => jobDetailStatusUpdates(job, 'Scheduled'), /Choose a start date/);
    assert.throws(() => jobDetailStatusUpdates(job, 'Scheduled', { ...schedule, scheduled_at: null }), /Choose a start date/);
    assert.throws(() => jobDetailStatusUpdates(job, 'Scheduled', { ...schedule, scheduled_at: 'invalid' }), /Choose a start date/);
  });

  it('completes without deleting the schedule or job type', () => {
    assert.deepEqual(jobDetailStatusUpdates({ status: 'Parts on Order', job_type: 'Delivery' }, 'Completed'), { status: 'Completed' });
  });

  it('reopens terminal jobs with the same initial workflow used by New Job', () => {
    const cases: [JobType, JobStatus][] = [
      ['Service', 'In Progress'], ['Repair', 'In Progress'], ['Warranty', 'Warranty'],
      ['Delivery', 'Delivery'], ['On Order', 'Parts on Order'], ['Pickup', 'Ready for Pickup'],
      ['Customer Pick Up', 'Ready for Pickup'], ['To Do', 'Pending Confirm'],
    ];
    for (const status of ['Completed', 'Cancelled'] as const) {
      for (const [job_type, expected] of cases) {
        const job = { status, job_type };
        assert.deepEqual(jobDetailStatusUpdates(job, 'Scheduled', schedule), { ...schedule, status: expected });
        assert.deepEqual(jobDetailStatusUpdates(job, 'Unscheduled'), {
          scheduled_at: null, scheduled_all_day: false, scheduled_end_date: null, status: expected,
        });
      }
    }
  });
});
