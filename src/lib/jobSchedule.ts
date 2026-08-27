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
