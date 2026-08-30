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
  const startDay = calendarDayNumber(new Date(job.scheduled_at));
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
  const jobStart = calendarDayNumber(new Date(job.scheduled_at));
  const firstVisibleDay = calendarDayNumber(rangeStart);
  const lastVisibleDay = calendarDayNumber(rangeEnd);
  if (jobStart === null || firstVisibleDay === null || lastVisibleDay === null) return false;
  const jobEnd = storedCalendarDayNumber(job.scheduled_end_date) ?? jobStart;
  return jobStart <= lastVisibleDay && jobEnd >= firstVisibleDay;
}

export function scheduleDateRangeError(startDateTime: string, endDate: string): string | null {
  if (!endDate) return null;
  if (!startDateTime) return 'Choose a start date before an end date.';
  return endDate < startDateTime.slice(0, 10) ? 'End date cannot be before start date.' : null;
}

export function moveJobScheduleToDay(
  job: Pick<Job, 'scheduled_at' | 'scheduled_end_date'>,
  targetDate: string,
): Pick<Job, 'scheduled_at' | 'scheduled_end_date'> {
  const existingStart = job.scheduled_at ? new Date(job.scheduled_at) : null;
  const targetStart = new Date(`${targetDate}T${existingStart && !Number.isNaN(existingStart.getTime())
    ? `${String(existingStart.getHours()).padStart(2, '0')}:${String(existingStart.getMinutes()).padStart(2, '0')}:${String(existingStart.getSeconds()).padStart(2, '0')}`
    : '09:00:00'}`);
  const startDay = existingStart ? calendarDayNumber(existingStart) : null;
  const endDay = storedCalendarDayNumber(job.scheduled_end_date);
  const targetDay = storedCalendarDayNumber(targetDate);
  const spanDays = startDay !== null && endDay !== null ? Math.max(0, endDay - startDay) : null;

  return {
    scheduled_at: targetStart.toISOString(),
    scheduled_end_date: targetDay !== null && spanDays !== null
      ? formatStoredCalendarDay(targetDay + spanDays)
      : null,
  };
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
