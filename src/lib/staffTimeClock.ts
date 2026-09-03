export type StaffClockOutReason = 'lunch' | 'end_day' | 'owner_edit';

export interface StaffTimeRangeEntry {
  clock_in: string;
  clock_out: string | null;
}

export function localDayKey(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function localDateRange(startDate: string, endDate: string): { start: string; endExclusive: string } | null {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (!startDate || !endDate || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), endExclusive: end.toISOString() };
}

export function timeEntryMinutes(entry: StaffTimeRangeEntry, now: Date = new Date()): number {
  const start = new Date(entry.clock_in).getTime();
  const end = entry.clock_out ? new Date(entry.clock_out).getTime() : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60_000));
}

export function timeEntriesMinutes(entries: StaffTimeRangeEntry[], now: Date = new Date()): number {
  return entries.reduce((total, entry) => total + timeEntryMinutes(entry, now), 0);
}

export function formatClockMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${String(remainder).padStart(2, '0')}m`;
}

export function toLocalDateTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function localDateTimeToIso(value: string): string | null {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
}
