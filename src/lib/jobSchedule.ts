import type { JobType, ScheduleJobType } from '@/types/database';

export const JOB_TYPE_OPTIONS: ScheduleJobType[] = [
  'Service',
  'Warranty',
  'Delivery',
  'On Order',
  'Customer Pick Up',
];

export function scheduleJobType(jobType: JobType): ScheduleJobType {
  if (jobType === 'Repair' || jobType === 'Installation' || jobType === 'Maintenance') return 'Service';
  if (jobType === 'Pickup') return 'Customer Pick Up';
  return jobType;
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
