export interface SummaryPunch {
  clock_in: string;
  clock_out: string | null;
  reason: 'lunch' | 'end_day' | 'owner_edit' | null;
  minutes: number;
  acknowledged_incomplete_count: number;
  acknowledged_titles: string[];
  owner_adjusted: boolean;
}

export interface SummaryStaff {
  id: string;
  name: string;
  role: string;
  punches: SummaryPunch[];
  minutes_total: number;
  delegated_completed: { title: string; completed_at: string }[];
  delegated_open: { title: string; due_at: string | null; overdue: boolean }[];
  delegated_sent: number;
}

export interface MorningSummary {
  day: string;
  window_start: string;
  window_end: string;
  generated_at: string;
  staff: SummaryStaff[];
  delegated: { created: number; completed: number; open: number; overdue: number };
  deals: {
    created: { title: string; amount: number | null; owner: string }[];
    won: { title: string; amount: number | null; owner: string }[];
    lost: { title: string; amount: number | null; reason: string | null }[];
    stage_changes: number;
  };
  jobs: {
    completed: { title: string; job_type: string }[];
    created: number;
    scheduled_today: { title: string; job_type: string; status: string; scheduled_at: string; all_day: boolean }[];
  };
  activity: {
    new_customers: number;
    inbound_texts: number;
    suggestions: number;
    fix_it_posts: number;
    clocked_in_count: number;
    incomplete_clock_outs: number;
  };
}

export const DEALERSHIP_TIME_ZONE = 'America/Chicago';

/** YYYY-MM-DD in dealership time (the summary's "day" is a Central day). */
export function centralDateKey(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: DEALERSHIP_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function defaultSummaryDay(now: Date = new Date()): string {
  return shiftDateKey(centralDateKey(now), -1);
}

export function summaryDayLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatSummaryMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}h ${String(rest).padStart(2, '0')}m` : `${rest}m`;
}

export function summaryMoney(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return `$${Math.round(value).toLocaleString()}`;
}

/** One line of numbers for the collapsed card and the 7:30 AM notification. */
export function summaryHeadline(summary: Pick<MorningSummary, 'activity' | 'delegated' | 'deals'>): string {
  const parts = [
    `${summary.activity.clocked_in_count} clocked in`,
    `${summary.delegated.completed} task${summary.delegated.completed === 1 ? '' : 's'} done`,
    `${summary.delegated.open} still open`,
    `${summary.deals.won.length} deal${summary.deals.won.length === 1 ? '' : 's'} won`,
  ];
  if (summary.activity.incomplete_clock_outs > 0) {
    parts.push(`${summary.activity.incomplete_clock_outs} clocked out with open tasks`);
  }
  return parts.join(' · ');
}

/** Staff who need Brandon's eye first: flagged clock-outs, overdue tasks, no punch at all. */
export function staffAttentionFlags(staff: SummaryStaff): string[] {
  const flags: string[] = [];
  const flagged = staff.punches.reduce((total, punch) => total + (punch.acknowledged_incomplete_count > 0 ? 1 : 0), 0);
  if (flagged > 0) flags.push(`Clocked out with open tasks (${flagged})`);
  const overdue = staff.delegated_open.filter(task => task.overdue).length;
  if (overdue > 0) flags.push(`${overdue} overdue`);
  if (staff.punches.some(punch => punch.owner_adjusted)) flags.push('Time card adjusted');
  return flags;
}
