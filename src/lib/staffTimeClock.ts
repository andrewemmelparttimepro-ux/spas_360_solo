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

function parseLocalDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  // Construct from numeric local-calendar parts instead of relying on browser
  // parsing of a date string. setFullYear also avoids Date's 1900 offset for
  // four-digit years below 0100.
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);

  // Date normalizes impossible dates (for example February 30), so round-trip
  // the local calendar components before accepting the value.
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;

  return date;
}

export function localDateRange(startDate: string, endDate: string): { start: string; endExclusive: string } | null {
  const start = parseLocalDateKey(startDate);
  const end = parseLocalDateKey(endDate);
  if (!start || !end || end < start) return null;
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

export interface PayrollEntry extends StaffTimeRangeEntry {
  employee?: { first_name: string; last_name: string } | null;
  clock_out_reason?: string | null;
  edited_at?: string | null;
  acknowledged_incomplete_count?: number;
  clock_in_ip?: string | null;
  clock_in_lat?: number | null;
  clock_in_lng?: number | null;
}

function csvCell(value: string | number | null | undefined): string {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Payroll export: one row per punch plus a total row per employee, hours as
 * decimals (7.25) so it drops straight into a payroll sheet.
 */
export function staffHoursCsv(entries: PayrollEntry[], startDate: string, endDate: string, now: Date = new Date()): string {
  const rows: string[][] = [[
    'Employee', 'Date', 'Clock in', 'Clock out', 'Reason', 'Minutes', 'Hours', 'Owner adjusted', 'Open tasks at clock-out', 'Clock-in IP', 'Clock-in location',
  ]];
  const totals = new Map<string, number>();
  const byEmployee = [...entries].sort((a, b) => {
    const nameA = a.employee ? `${a.employee.first_name} ${a.employee.last_name}` : '';
    const nameB = b.employee ? `${b.employee.first_name} ${b.employee.last_name}` : '';
    return nameA.localeCompare(nameB) || a.clock_in.localeCompare(b.clock_in);
  });
  for (const entry of byEmployee) {
    const employee = entry.employee ? `${entry.employee.first_name} ${entry.employee.last_name}`.trim() : 'Unknown';
    const minutes = timeEntryMinutes(entry, now);
    totals.set(employee, (totals.get(employee) ?? 0) + minutes);
    const start = new Date(entry.clock_in);
    rows.push([
      employee,
      start.toLocaleDateString('en-US'),
      start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
      entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'still clocked in',
      entry.clock_out_reason ?? '',
      String(minutes),
      (minutes / 60).toFixed(2),
      entry.edited_at ? 'yes' : '',
      String(entry.acknowledged_incomplete_count ?? 0),
      entry.clock_in_ip ?? '',
      entry.clock_in_lat != null && entry.clock_in_lng != null ? `${entry.clock_in_lat},${entry.clock_in_lng}` : '',
    ]);
  }
  rows.push([]);
  rows.push(['Employee', 'Period', 'Total minutes', 'Total hours']);
  for (const [employee, minutes] of [...totals.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    rows.push([employee, `${startDate} to ${endDate}`, String(minutes), (minutes / 60).toFixed(2)]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\n');
}

export function payrollFileName(startDate: string, endDate: string, employee?: string): string {
  const who = employee ? employee.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'all-employees';
  return `staff-hours-${who}-${startDate}-to-${endDate}.csv`;
}
