import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  defaultSummaryDay,
  formatSummaryMinutes,
  shiftDateKey,
  staffAttentionFlags,
  summaryDayLabel,
  summaryHeadline,
} from '../src/lib/morningSummary.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Owner Morning Summary', () => {
  it('defaults to yesterday in dealership time and moves by whole days', () => {
    assert.equal(defaultSummaryDay(new Date('2026-09-03T13:30:00Z')), '2026-09-02');
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
      punches: [{ clock_in: '2026-09-02T14:00:00Z', clock_out: '2026-09-02T22:00:00Z', reason: 'end_day', minutes: 480, acknowledged_incomplete_count: 1, acknowledged_titles: ['Quote'], owner_adjusted: false }],
    });
    assert.deepEqual(flags, ['Clocked out with open tasks (1)', '1 overdue']);
  });

  it('is owner-only in the database, sits at the top of the dashboard, and pings owners at 7:30 AM Central', async () => {
    const [migration, panel, dashboard, hook] = await Promise.all([
      read('supabase/migrations/20260903151000_owner_morning_summary.sql'),
      read('src/components/dashboard/MorningSummaryPanel.tsx'),
      read('src/pages/Dashboard.tsx'),
      read('src/hooks/useMorningSummary.ts'),
    ]);
    assert.match(migration, /create or replace function public\.owner_morning_summary\(p_day date default null\)/);
    assert.match(migration, /'Owner access required'/);
    assert.match(migration, /at time zone 'America\/Chicago'/);
    assert.match(migration, /acknowledged_incomplete_count/);
    assert.match(migration, /s\.is_won/);
    assert.match(migration, /cron\.schedule\('spas360-morning-summary', '30 12 \* \* \*'/);
    assert.match(migration, /'\/dashboard\?summary=open'/);
    assert.match(panel, /Morning Summary/);
    assert.match(panel, /params\.get\('summary'\) === 'open'/);
    assert.match(panel, /Everyone's day/);
    assert.match(hook, /rpc\('owner_morning_summary', \{ p_day: day \}\)/);
    assert.ok(dashboard.indexOf('<MorningSummaryPanel />') < dashboard.indexOf('<DelegatedTasksPanel />'));
  });
});
