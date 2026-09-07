import type { Job, ScheduleJobType } from '../types/database.ts';
import { jobOccursOnCalendarDay, jobScheduleDraft, jobScheduleUpdatesFromDraft, scheduleJobType } from './jobSchedule.ts';

export const TODAY_JOB_TYPES: ScheduleJobType[] = ['Service', 'Delivery', 'Warranty', 'Customer Pick Up', 'On Order', 'To Do'];
export type ScheduleCountJob = Pick<Job, 'id' | 'job_type' | 'status' | 'scheduled_at' | 'scheduled_end_date'>;
export type ScheduleCounts = Record<ScheduleJobType, number>;
export type ScheduleView = 'day' | 'week' | 'month';
export interface DashboardScheduleFilter {
  date: string;
  types: ScheduleJobType[];
  view: ScheduleView;
}

export function dealershipDate(now = new Date()): string {
  return jobScheduleDraft({ scheduled_at: now.toISOString(), scheduled_all_day: true, scheduled_end_date: null }).startDate;
}

// Calendar helpers accept local calendar dates, not instants. Noon also avoids
// local DST transitions when the browser is outside the dealership timezone.
export function scheduleCalendarDate(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

export function scheduleDayBounds(date: string) {
  if (!scheduleCalendarDate(date)) throw new Error('Invalid schedule date.');
  const nextDate = new Date(new Date(`${date}T12:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);
  return {
    start: jobScheduleUpdatesFromDraft(date, '00:00', '').scheduled_at!,
    end: jobScheduleUpdatesFromDraft(nextDate, '00:00', '').scheduled_at!,
  };
}

export function scheduledJobsForDay<T extends ScheduleCountJob>(jobs: T[], date: string, types: ScheduleJobType[] = []): T[] {
  const day = scheduleCalendarDate(date);
  if (!day) return [];
  return jobs.filter(job => job.status !== 'Cancelled'
    && jobOccursOnCalendarDay(job, day)
    && (types.length === 0 || types.includes(scheduleJobType(job.job_type))));
}

export function countScheduledJobs(jobs: ScheduleCountJob[], date: string): ScheduleCounts {
  const counts = Object.fromEntries(TODAY_JOB_TYPES.map(type => [type, 0])) as ScheduleCounts;
  for (const job of scheduledJobsForDay(jobs, date)) {
    const type = scheduleJobType(job.job_type);
    if (type in counts) counts[type] += 1;
  }
  return counts;
}

export function dashboardScheduleLink(filter: DashboardScheduleFilter): string {
  const params = new URLSearchParams({ date: filter.date, stores: 'all', view: filter.view });
  for (const type of filter.types) params.append('type', type);
  return `/service?${params}`;
}

export function parseDashboardScheduleFilter(search: string): DashboardScheduleFilter | null {
  const params = new URLSearchParams(search);
  const date = params.get('date') ?? '';
  const types = params.getAll('type');
  const view = params.get('view');
  if (params.get('stores') !== 'all' || !scheduleCalendarDate(date)
    || !['day', 'week', 'month'].includes(view ?? '')
    || types.some(type => !TODAY_JOB_TYPES.includes(type as ScheduleJobType))) return null;
  return { date, types: [...new Set(types)] as ScheduleJobType[], view: view as ScheduleView };
}

// Continue through short pages too: the API may cap rows below the requested
// size. Publish no partial counts if any later page fails.
export async function loadSchedulePages<T>(fetchPage: (offset: number, pageSize: number) => PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const result = await fetchPage(rows.length, 500);
    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error('Schedule response was empty. Please retry.');
    if (result.data.length === 0) return rows;
    rows.push(...result.data);
  }
}
