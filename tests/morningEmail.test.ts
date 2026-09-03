import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { morningEmailHtml, morningEmailSubject, morningEmailText, summaryHeadline, type EmailSummary } from '../api/_lib/morning-email.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

const summary: EmailSummary = {
  day: '2026-09-02',
  staff: [{
    name: 'Alex Burckhard',
    punches: [{ clock_in: '2026-09-02T14:02:00Z', clock_out: '2026-09-02T22:10:00Z', reason: 'end_day', acknowledged_incomplete_count: 1, acknowledged_titles: ['Email Bob Johnson a quote'], owner_adjusted: false }],
    minutes_total: 488,
    delegated_completed: [{ title: 'Pull the Covana cover' }],
    delegated_open: [{ title: 'Email Bob Johnson a quote', due_at: '2026-09-02T21:00:00Z', overdue: true }],
    delegated_sent: 0,
  }],
  delegated: { created: 2, completed: 1, open: 1, overdue: 1 },
  deals: { created: [], won: [{ title: 'Wyant – Hot Tub', amount: 12000, owner: 'Alex Burckhard' }], lost: [], stage_changes: 2 },
  jobs: { completed: [{ title: 'Smith – Delivery', job_type: 'Delivery' }], created: 1, scheduled_today: [{ title: 'Jones – Service', job_type: 'Service', scheduled_at: '2026-09-03T15:00:00Z', all_day: false }] },
  activity: { new_customers: 1, inbound_texts: 3, suggestions: 0, fix_it_posts: 0, clocked_in_count: 1, incomplete_clock_outs: 1 },
};

describe('emailed Morning Summary', () => {
  it('writes a subject and headline an owner can read from the inbox list', () => {
    assert.equal(summaryHeadline(summary), '1 clocked in · 1 task done · 1 still open · 1 deal won · 1 clocked out with open tasks');
    assert.equal(morningEmailSubject(summary), 'Morning Summary — Wednesday, September 2: 1 clocked in · 1 task done · 1 still open · 1 deal won · 1 clocked out with open tasks');
  });

  it('renders the same facts as the dashboard, escaped, with Ari\'s read on top', () => {
    const html = morningEmailHtml(summary, 'Alex left one task open and clocked out at 5:10; the Wyant deal closed.', 'https://spas360solo.vercel.app');
    assert.match(html, /Ari's read<\/span>Alex left one task open/);
    assert.match(html, /Clocked out with open tasks/);
    assert.match(html, /Left open: Email Bob Johnson a quote/);
    assert.match(html, /Won<\/b> Wyant – Hot Tub · \$12,000 · Alex Burckhard/);
    assert.match(html, /dashboard\?summary=open/);
    assert.doesNotMatch(html, /<script/);
    const text = morningEmailText(summary, null, 'https://spas360solo.vercel.app');
    assert.match(text, /- Alex Burckhard: .*8h 08m · 1 done · 1 open · clocked out with open tasks/);
  });

  it('sends once per owner per day from a secret-guarded route on a 7:35 AM Central cron', async () => {
    const [route, migration] = await Promise.all([read('api/owners/morning-email.ts'), read('supabase/migrations/20260903190000_morning_summary_email.sql')]);
    assert.match(route, /x-morning-secret/);
    assert.match(route, /!\/@ndai\\\.pro\$\/i\.test/);
    assert.match(route, /morning_summary_emails/);
    assert.match(route, /rpc\('morning_summary_for_org'/);
    assert.match(migration, /grant execute on function public\.morning_summary_for_org\(uuid, date\) to service_role/);
    assert.match(migration, /unique \(org_id, day, user_id\)/);
    assert.match(migration, /cron\.schedule\('spas360-morning-summary-email', '35 12 \* \* \*'/);
    assert.match(migration, /add column if not exists morning_summary_email boolean not null default true/);
  });
});
