import type { InventoryItem, Job, JobStatus, JobType, ScheduleJobType } from '@/types/database';
import { inventoryCustomerOrStock } from './inventoryFields.ts';
import type { InventoryDealAssignment } from './inventoryDealAssignment.ts';

export const JOB_TYPE_OPTIONS: ScheduleJobType[] = [
  'Service',
  'Warranty',
  'Delivery',
  'On Order',
  'Customer Pick Up',
  'To Do',
];

export function scheduleJobType(jobType: JobType): ScheduleJobType {
  if (jobType === 'Repair' || jobType === 'Installation' || jobType === 'Maintenance') return 'Service';
  if (jobType === 'Pickup') return 'Customer Pick Up';
  return jobType;
}

// The queue's visible label and fill describe workflow state. Titles and the
// scheduled job type can contain different business language.
export function unscheduledJobVisualStatus(job: Pick<Job, 'job_type' | 'status' | 'title'>): JobStatus {
  return job.status;
}

export function unscheduledJobStatusLabel(status: JobStatus): string {
  if (status === 'Parts on Order') return 'On Order';
  if (status === 'Pending Confirm') return 'To Do';
  if (status === 'In Progress') return 'Service';
  return status;
}

export function calendarJobTitleClass(status: JobStatus): string | undefined {
  return status === 'Completed' ? 'line-through decoration-solid decoration-2' : undefined;
}

const CALENDAR_DAY_MS = 24 * 60 * 60 * 1000;
const SCHEDULE_TIME_ZONE = 'America/Chicago';

type ScheduleFields = Pick<Job, 'scheduled_at' | 'scheduled_all_day' | 'scheduled_end_date'>;

export interface JobScheduleDraft {
  startDate: string;
  startTime: string;
  endDate: string;
}

const schedulePartFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHEDULE_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function scheduleParts(value: Date) {
  const parts = Object.fromEntries(
    schedulePartFormatter.formatToParts(value).map(part => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function validCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

function storedScheduleCalendarDate(value: string): string | null {
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  const parts = scheduleParts(instant);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

// Convert a dealership wall-clock time to an instant without depending on the
// browser's timezone. The short correction loop also handles CST/CDT offsets.
function centralWallClockToIso(date: string, time: string): string | null {
  if (!validCalendarDate(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);
  const desiredWallClock = Date.UTC(year, month - 1, day, hour, minute, 0);
  let candidate = desiredWallClock;

  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = scheduleParts(new Date(candidate));
    const actualWallClock = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const correction = desiredWallClock - actualWallClock;
    candidate += correction;
    if (correction === 0) break;
  }

  const final = scheduleParts(new Date(candidate));
  if (final.year !== year || final.month !== month || final.day !== day || final.hour !== hour || final.minute !== minute) {
    return null;
  }
  return new Date(candidate).toISOString();
}

// Date-only jobs still need a non-null scheduled_at so they remain scheduled.
// 18:00Z is always the same dealership date (12 PM CST / 1 PM CDT), while the
// explicit flag keeps it distinct from a real appointment at that instant.
function dateOnlyScheduleInstant(date: string): string | null {
  if (!validCalendarDate(date)) return null;
  return `${date}T18:00:00.000Z`;
}

export function jobScheduleDraft(job: ScheduleFields): JobScheduleDraft {
  const instant = job.scheduled_at ? new Date(job.scheduled_at) : null;
  const validInstant = instant && !Number.isNaN(instant.getTime()) ? instant : null;
  const parts = validInstant ? scheduleParts(validInstant) : null;
  return {
    startDate: job.scheduled_at ? (storedScheduleCalendarDate(job.scheduled_at) ?? '') : '',
    startTime: parts && !job.scheduled_all_day
      ? `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`
      : '',
    endDate: job.scheduled_end_date ?? '',
  };
}

export function jobScheduleUpdatesFromDraft(
  startDate: string,
  startTime: string,
  endDate: string,
): ScheduleFields {
  if (!startDate) {
    return { scheduled_at: null, scheduled_all_day: false, scheduled_end_date: null };
  }
  const scheduledAt = startTime
    ? centralWallClockToIso(startDate, startTime)
    : dateOnlyScheduleInstant(startDate);
  if (!scheduledAt) {
    throw new Error('Choose a valid schedule date and time.');
  }
  return {
    scheduled_at: scheduledAt,
    scheduled_all_day: !startTime,
    scheduled_end_date: endDate || null,
  };
}

function calendarDayNumber(date: Date): number | null {
  if (Number.isNaN(date.getTime())) return null;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / CALENDAR_DAY_MS;
}

function storedCalendarDayNumber(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / CALENDAR_DAY_MS;
}

function formatStoredCalendarDay(dayNumber: number): string {
  return new Date(dayNumber * CALENDAR_DAY_MS).toISOString().slice(0, 10);
}

export function jobOccursOnCalendarDay(
  job: Pick<Job, 'scheduled_at' | 'scheduled_end_date'>,
  day: Date,
): boolean {
  if (!job.scheduled_at) return false;
  const startDay = storedCalendarDayNumber(storedScheduleCalendarDate(job.scheduled_at));
  const requestedDay = calendarDayNumber(day);
  if (startDay === null || requestedDay === null) return false;
  const endDay = storedCalendarDayNumber(job.scheduled_end_date) ?? startDay;
  return requestedDay >= startDay && requestedDay <= endDay;
}

export function jobOverlapsCalendarRange(
  job: Pick<Job, 'scheduled_at' | 'scheduled_end_date'>,
  rangeStart: Date,
  rangeEnd: Date,
): boolean {
  if (!job.scheduled_at) return false;
  const jobStart = storedCalendarDayNumber(storedScheduleCalendarDate(job.scheduled_at));
  const firstVisibleDay = calendarDayNumber(rangeStart);
  const lastVisibleDay = calendarDayNumber(rangeEnd);
  if (jobStart === null || firstVisibleDay === null || lastVisibleDay === null) return false;
  const jobEnd = storedCalendarDayNumber(job.scheduled_end_date) ?? jobStart;
  return jobStart <= lastVisibleDay && jobEnd >= firstVisibleDay;
}

export function scheduleDateRangeError(startDate: string, endDate: string, startTime = ''): string | null {
  if (startDate && startTime && !centralWallClockToIso(startDate, startTime)) {
    return 'Choose a valid time for that date.';
  }
  if (!endDate) return null;
  if (!startDate) return 'Choose a start date before an end date.';
  return endDate < startDate ? 'End date cannot be before start date.' : null;
}

export function moveJobScheduleToDay(
  job: ScheduleFields,
  targetDate: string,
): ScheduleFields {
  const existingDraft = jobScheduleDraft(job);
  const startDay = storedCalendarDayNumber(existingDraft.startDate);
  const endDay = storedCalendarDayNumber(job.scheduled_end_date);
  const targetDay = storedCalendarDayNumber(targetDate);
  const spanDays = startDay !== null && endDay !== null ? Math.max(0, endDay - startDay) : null;
  const movedEnd = targetDay !== null && spanDays !== null
    ? formatStoredCalendarDay(targetDay + spanDays)
    : '';

  return jobScheduleUpdatesFromDraft(targetDate, existingDraft.startTime, movedEnd);
}

export function availableInventoryForJob<T extends Pick<
  InventoryItem,
  'status' | 'customer_id' | 'deal_id' | 'job_id' | 'location_id' | 'notes'
> & {
  dealAssignment: InventoryDealAssignment | null;
}>(items: T[], locationId: string): T[] {
  return items.filter(item => (
    item.status === 'In Stock'
    && item.customer_id === null
    && item.deal_id === null
    && item.job_id === null
    && item.dealAssignment === null
    && inventoryCustomerOrStock(item.notes, item.customer_id) === 'Stock'
    && (!locationId || item.location_id === locationId)
  ));
}

export function inventoryChoicesForJob<T extends Pick<
  InventoryItem,
  'id' | 'status' | 'customer_id' | 'deal_id' | 'job_id' | 'location_id' | 'notes'
> & {
  dealAssignment: InventoryDealAssignment | null;
}>(items: T[], jobId: string, locationId: string): T[] {
  const availableIds = new Set(
    availableInventoryForJob(items, locationId).map(item => item.id),
  );

  return items.filter(item => item.job_id === jobId || availableIds.has(item.id));
}

/**
 * Contacts store mailing addresses as a single free-form field. Prefer the
 * comma-delimited city immediately before a state/ZIP component, while also
 * supporting the common multi-line street + "City, ST ZIP" shape.
 */
export function customerCityFromAddress(address: string | null | undefined): string | null {
  if (!address?.trim()) return null;
  const parts = address
    .replace(/\r?\n/g, ',')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length < 2) return null;
  const last = parts.at(-1) ?? '';
  if (/^[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/i.test(last)) {
    return parts.at(-2) ?? null;
  }
  return parts.length >= 3 ? (parts.at(-2) ?? null) : parts.at(-1) ?? null;
}
