import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  formatClockMinutes,
  localDateRange,
  payrollFileName,
  staffHoursCsv,
  timeEntriesMinutes,
  toLocalDateTimeInput,
} from '../src/lib/staffTimeClock.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const migrationPath = 'supabase/migrations/20260903021301_staff_attendance_time_clock.sql';
const ackMigrationPath = 'supabase/migrations/20260903150500_clock_out_acknowledgements.sql';

describe('staff attendance time clock', () => {
  it('calculates multiple work segments for lunch and clock-back-in days', () => {
    const entries = [
      { clock_in: '2026-09-03T13:00:00Z', clock_out: '2026-09-03T17:00:00Z' },
      { clock_in: '2026-09-03T17:30:00Z', clock_out: '2026-09-03T21:45:00Z' },
    ];
    assert.equal(timeEntriesMinutes(entries), 495);
    assert.equal(formatClockMinutes(495), '8h 15m');
  });

  it('builds inclusive local custom-date boundaries and editable local values', () => {
    const range = localDateRange('2026-09-01', '2026-09-03')!;
    assert.ok(new Date(range.endExclusive) > new Date(range.start));
    assert.equal(localDateRange('2026-09-03', '2026-09-01'), null);
    assert.match(toLocalDateTimeInput('2026-09-03T14:30:00Z'), /^2026-09-03T\d{2}:30$/);
  });

  it('stops safely when the current local date cannot produce a clock range', async () => {
    const hook = await read('src/hooks/useStaffTimeClock.ts');
    const rangeDeclaration = hook.indexOf('const range = localDateRange(today, today);');
    const nullGuard = hook.indexOf('if (!range) {', rangeDeclaration);
    const firstRangeRead = hook.indexOf(".gte('clock_in', range.start)", rangeDeclaration);

    assert.ok(rangeDeclaration >= 0);
    assert.ok(nullGuard > rangeDeclaration);
    assert.ok(firstRangeRead > nullGuard);
    assert.match(
      hook.slice(nullGuard, firstRangeRead),
      /setEntries\(\[\]\);[\s\S]*setActiveEntry\(null\);[\s\S]*setError\([\s\S]*setIsLoading\(false\);[\s\S]*return;/,
    );
  });

  it('puts a persistent Clock In/Out control beside notifications and prompts on the first daily login', async () => {
    const [header, control, hook] = await Promise.all([
      read('src/components/layout/Header.tsx'),
      read('src/components/StaffTimeClockControl.tsx'),
      read('src/hooks/useStaffTimeClock.ts'),
    ]);
    assert.ok(header.indexOf('<StaffTimeClockControl />') < header.indexOf('{/* Notifications */}'));
    assert.match(control, /aria-label="Clock In\/Out"/);
    assert.match(control, /Clock In\/Out<\/span>/);
    assert.match(control, /spas360:staff-clock-prompt:/);
    assert.match(control, /entries\.length > 0/);
    assert.match(control, /Clock Out for Lunch/);
    assert.match(control, /Clock Back In/);
    assert.match(control, /Clock Out for Day/);
    assert.match(control, /Dismiss time clock/);
    assert.match(hook, /rpc\('staff_clock_in', await punchStamp\(\)\)/);
    assert.match(hook, /rpc\('staff_clock_out', \{ p_reason: reason, p_acknowledged_task_ids: acknowledgedTaskIds \?\? null \}\)/);
    assert.match(hook, /\.is\('clock_out', null\)[\s\S]*\.maybeSingle\(\)/);
    assert.match(hook, /postgres_changes/);
  });

  it('blocks clock-out behind a per-task acknowledgement of incomplete delegated work and tells the owner', async () => {
    const [control, migration] = await Promise.all([read('src/components/StaffTimeClockControl.tsx'), read(ackMigrationPath)]);
    assert.match(control, /fetchMyIncompleteDelegatedTasks\(profile\.id\)/);
    assert.match(control, /You still have incomplete delegated tasks/);
    assert.match(control, /Acknowledge \$\{task\.title\} is incomplete/);
    assert.match(control, /disabled=\{!allAcknowledged \|\| isSaving\}/);
    assert.match(control, /I acknowledge — clock out anyway/);
    assert.match(control, /Go finish them first/);
    assert.match(control, /Ask an owner to correct it/);
    assert.match(control, /task_type: DELEGATED_TASK_TYPE/);
    assert.match(migration, /add column if not exists acknowledged_task_ids uuid\[\]/);
    assert.match(migration, /drop function if exists public\.staff_clock_out\(text\)/);
    assert.match(migration, /v_incomplete <@ coalesce\(p_acknowledged_task_ids/);
    assert.match(migration, /Acknowledge each incomplete delegated task before clocking out/);
    assert.match(migration, /role = 'owner_manager'/);
    assert.match(migration, /'clock_out_incomplete'/);
    assert.match(migration, /'\/dashboard\?delegated=open&staff=' \|\| v_user_id::text/);
  });

  it('adds owner-only custom-range reporting with all/specific employee filters and missed-hours edits', async () => {
    const [corner, report, hook] = await Promise.all([
      read('src/pages/OwnersCorner.tsx'),
      read('src/components/StaffTimeReport.tsx'),
      read('src/hooks/useStaffTimeClock.ts'),
    ]);
    assert.match(corner, /<StaffTimeReport \/>/);
    assert.match(report, /aria-label="Staff hours start date"/);
    assert.match(report, /aria-label="Staff hours end date"/);
    assert.match(report, /<option value="">All Employees<\/option>/);
    assert.match(report, /Add missed hours/);
    assert.match(report, /Owner adjusted/);
    assert.match(hook, /profile\.role !== 'owner_manager'/);
    assert.match(hook, /REPORT_PAGE_SIZE = 1000/);
    assert.match(hook, /\.range\(from, from \+ REPORT_PAGE_SIZE - 1\)/);
    assert.match(hook, /owner_create_staff_time_entry/);
    assert.match(hook, /owner_update_staff_time_entry/);
  });

  it('uses server-authored punches, owner-checked corrections, explicit grants, and tenant RLS', async () => {
    const migration = await read(migrationPath);
    assert.match(migration, /create table if not exists public\.staff_time_entries/);
    assert.match(migration, /create unique index if not exists idx_staff_time_entries_one_open_shift/);
    assert.match(migration, /create policy staff_time_entries_read[\s\S]*user_id = \(select auth\.uid\(\)\)[\s\S]*owner_manager/);
    assert.match(migration, /insert into public\.staff_time_entries[\s\S]*clock_timestamp\(\)/);
    assert.match(migration, /set clock_out = clock_timestamp\(\)/);
    assert.match(migration, /p_reason not in \('lunch', 'end_day'\)/);
    assert.match(migration, /public\.auth_role\(\)\) <> 'owner_manager'/);
    assert.match(migration, /and org_id = \(select public\.auth_org\(\)\)/);
    assert.match(migration, /The corrected hours overlap an existing time entry/);
    assert.match(migration, /tstzrange\(entry\.clock_in, entry\.clock_out, '\[\)'\)/);
    assert.match(migration, /security definer/);
    assert.match(migration, /create or replace function public\.staff_clock_in\(\)[\s\S]*security invoker/);
    assert.match(migration, /revoke all on table public\.staff_time_entries from public, anon, authenticated/);
    assert.match(migration, /grant select on table public\.staff_time_entries to authenticated/);
    assert.doesNotMatch(migration, /grant (insert|update|delete) on table public\.staff_time_entries to authenticated/i);
  });

  it('exports a payroll CSV with decimal hours and per-employee totals', () => {
    const csv = staffHoursCsv([
      { employee: { first_name: 'Alex', last_name: 'Burckhard' }, clock_in: '2026-09-01T14:00:00Z', clock_out: '2026-09-01T18:15:00Z', clock_out_reason: 'lunch', clock_in_ip: '174.1.2.3' },
      { employee: { first_name: 'Alex', last_name: 'Burckhard' }, clock_in: '2026-09-01T19:00:00Z', clock_out: '2026-09-01T22:00:00Z', clock_out_reason: 'end_day', acknowledged_incomplete_count: 1 },
    ], '2026-09-01', '2026-09-15');
    const lines = csv.split('\n');
    assert.equal(lines[0], 'Employee,Date,Clock in,Clock out,Reason,Minutes,Hours,Owner adjusted,Open tasks at clock-out,Clock-in IP,Clock-in location');
    assert.match(lines[1], /^Alex Burckhard,.*,lunch,255,4\.25,,0,174\.1\.2\.3,$/);
    assert.match(lines[2], /,end_day,180,3\.00,,1,,$/);
    assert.equal(lines[lines.length - 1], 'Alex Burckhard,2026-09-01 to 2026-09-15,435,7.25');
    assert.equal(payrollFileName('2026-09-01', '2026-09-15', 'Alex Burckhard'), 'staff-hours-alex-burckhard-2026-09-01-to-2026-09-15.csv');
  });

  it('stamps every clock-in with where it came from and lets owners export', async () => {
    const [hook, report, migration, whoami] = await Promise.all([
      read('src/hooks/useStaffTimeClock.ts'),
      read('src/components/StaffTimeReport.tsx'),
      read('supabase/migrations/20260903170000_staff_ops_round_two.sql'),
      read('api/whoami.ts'),
    ]);
    assert.match(hook, /rpc\('staff_clock_in', await punchStamp\(\)\)/);
    assert.match(hook, /navigator\.geolocation\.getCurrentPosition/);
    assert.match(hook, /fetch\('\/api\/whoami'/);
    assert.match(whoami, /x-forwarded-for/);
    assert.match(migration, /add column if not exists clock_in_ip text/);
    assert.match(migration, /p_ip text default null, p_lat double precision default null/);
    assert.match(report, /Export payroll CSV/);
    assert.match(report, /No location shared/);
  });
});
