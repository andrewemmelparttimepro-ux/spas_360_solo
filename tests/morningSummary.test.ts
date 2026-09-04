import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  defaultSummaryDay,
  defaultDailySummaryDay,
  formatSummaryMinutes,
  personalPerformanceRead,
  shiftDateKey,
  staffAttentionFlags,
  summaryDayLabel,
  summaryHeadline,
} from '../src/lib/morningSummary.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Owner Morning Summary', () => {
  it('defaults to yesterday in dealership time and moves by whole days', () => {
    assert.equal(defaultSummaryDay(new Date('2026-09-03T13:30:00Z')), '2026-09-02');
    assert.equal(defaultDailySummaryDay(new Date('2026-09-03T13:30:00Z')), '2026-09-03');
    // 11:30 PM Central on the 2nd is already the 3rd in UTC — the summary must still say the 2nd was "yesterday" only after Central midnight.
    assert.equal(defaultSummaryDay(new Date('2026-09-03T04:30:00Z')), '2026-09-01');
    assert.equal(shiftDateKey('2026-09-01', -1), '2026-08-31');
    assert.equal(summaryDayLabel('2026-09-02'), 'Wednesday, September 2');
    assert.equal(formatSummaryMinutes(495), '8h 15m');
  });

  it('writes the one-line headline Brandon reads first', () => {
    const headline = summaryHeadline({
      activity: { new_customers: 1, inbound_texts: 0, suggestions: 0, fix_it_posts: 0, clocked_in_count: 4, incomplete_clock_outs: 1 },
      delegated: { created: 3, completed: 2, open: 5, overdue: 1 },
      deals: { created: [], won: [{ title: 'Wyant', amount: 12000, owner: 'Alex' }], lost: [], stage_changes: 2 },
    });
    assert.equal(headline, '4 clocked in · 2 tasks done · 5 still open · 1 deal won · 1 clocked out with open tasks');
  });

  it('flags teammates who need the owner\'s attention', () => {
    const flags = staffAttentionFlags({
      id: 'x', name: 'Alex', role: 'service_manager', minutes_total: 480, delegated_sent: 0, delegated_completed: [],
      delegated_open: [{ title: 'Quote', due_at: '2026-09-02T21:00:00Z', overdue: true }],
      leads_followed_up: 0, tasks_set: 0, deals_created: 0, deals_won: 0, deals_lost: 0, must_dos: [],
      punches: [{ clock_in: '2026-09-02T14:00:00Z', clock_out: '2026-09-02T22:00:00Z', reason: 'end_day', minutes: 480, acknowledged_incomplete_count: 1, acknowledged_titles: ['Quote'], owner_adjusted: false }],
    });
    assert.deepEqual(flags, ['Clocked out with open tasks (1)', '1 overdue']);
  });

  it('serves each teammate safely, sits above Delegated Tasks, and keeps owner-wide totals owner-only', async () => {
    const [migration, panel, dashboard, hook] = await Promise.all([
      read('supabase/migrations/20260904030000_daily_summary_for_everyone.sql'),
      read('src/components/dashboard/MorningSummaryPanel.tsx'),
      read('src/pages/Dashboard.tsx'),
      read('src/hooks/useMorningSummary.ts'),
    ]);
    assert.match(migration, /create or replace function public\.owner_morning_summary\(p_day date default null\)/);
    assert.match(migration, /'Signed-in access required'/);
    assert.match(migration, /at time zone 'America\/Chicago'/);
    assert.match(migration, /and \(v_is_owner or p\.id = v_user\)/);
    assert.match(migration, /if v_is_owner then/);
    assert.match(migration, /task_type in \('Sales Follow-Up', 'Follow-up'\)/);
    assert.match(migration, /as leads_followed_up/);
    assert.match(migration, /as tasks_set/);
    assert.match(migration, /as deals_created/);
    assert.match(migration, /as deals_won/);
    assert.match(migration, /as deals_lost/);
    assert.match(migration, /as must_dos/);
    assert.match(panel, /Daily Summary/);
    assert.match(panel, /params\.get\('summary'\) === 'open'/);
    assert.match(panel, /Staff-wide totals/);
    assert.match(panel, /Your individual summary/);
    assert.match(panel, /Must-dos for this day/);
    assert.match(hook, /p_day: shiftDateKey\(day, -1\)/);
    const summaryIndex = dashboard.indexOf('<MorningSummaryPanel />');
    const delegatedIndex = dashboard.indexOf('<DelegatedTasksPanel />');
    const followUpIndex = dashboard.indexOf('<UpcomingTasksPanel');
    const revenueIndex = dashboard.indexOf('Revenue Overview');
    assert.ok(summaryIndex < delegatedIndex);
    assert.ok(delegatedIndex < followUpIndex);
    assert.ok(followUpIndex < revenueIndex);
    assert.equal(dashboard.includes('<EveryonesDayPanel />'), false);
  });

  it('uses one compact disclosure and deterministic personalized coaching', async () => {
    const panel = await read('src/components/dashboard/MorningSummaryPanel.tsx');
    assert.match(panel, /const \[open, setOpen\] = useState\(false\)/);
    assert.match(panel, /aria-controls="morning-summary-body"/);
    assert.match(panel, /aria-expanded=\{open\}/);
    assert.match(panel, /\{open && \(/);
    assert.doesNotMatch(panel, /morning-narration/);

    const prose = personalPerformanceRead({
      id: 'x', name: 'Alex', role: 'salesperson', punches: [], minutes_total: 0,
      delegated_completed: [], delegated_open: [], delegated_sent: 0,
      leads_followed_up: 3, tasks_set: 2, deals_created: 1, deals_won: 1, deals_lost: 0,
      must_dos: [{ title: 'Call Pat', due_at: '2026-09-03T15:00:00Z', priority: 'High', task_type: 'Sales Follow-Up', overdue: true }],
    });
    assert.equal(prose, '3 leads followed up · 2 tasks set · 1 new deal · 1 won · 0 lost. Nice work — keep that momentum going. You have 1 must-do for this day, including 1 overdue.');
  });
});
