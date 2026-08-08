import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultFollowUpInputValue,
  formatFollowUpDue,
  getFollowUpState,
  summarizeDealFollowUps,
  type FollowUpTaskLike,
} from '../src/lib/followUp.ts';

const task = (overrides: Partial<FollowUpTaskLike>): FollowUpTaskLike => ({
  id: 'task-1',
  deal_id: 'deal-1',
  assigned_to: 'salesperson-1',
  title: 'Call the lead',
  due_at: '2026-07-24T14:00:00.000Z',
  priority: 'Medium',
  status: 'Pending',
  ...overrides,
});

// Build local-zone instants so assertions hold in any timezone the tests run in
const local = (y: number, m: number, d: number, h = 9, min = 0) => new Date(y, m - 1, d, h, min);

test('summarizes the earliest open task and counts all open tasks per deal', () => {
  const summaries = summarizeDealFollowUps([
    task({ id: 'later', due_at: '2026-07-25T14:00:00.000Z' }),
    task({ id: 'completed', due_at: '2026-07-23T14:00:00.000Z', status: 'Completed' }),
    task({ id: 'earliest', due_at: '2026-07-24T13:00:00.000Z' }),
    task({ id: 'other-deal', deal_id: 'deal-2' }),
  ]);

  assert.equal(summaries.get('deal-1')?.id, 'earliest');
  assert.equal(summaries.get('deal-1')?.openTaskCount, 2);
  assert.equal(summaries.get('deal-2')?.openTaskCount, 1);
});

test('classifies missing, overdue, today, and scheduled follow-ups', () => {
  // Local-zone instants: at UTC offsets near +09:00 the old UTC literals crossed local midnight
  const now = local(2026, 7, 23, 10);
  const base = summarizeDealFollowUps([task({ due_at: local(2026, 7, 23, 16).toISOString() })]).get('deal-1');

  assert.equal(getFollowUpState(null, now), 'missing');
  assert.equal(getFollowUpState(base, now), 'today');
  assert.equal(getFollowUpState({ ...base!, dueAt: local(2026, 7, 23, 8).toISOString() }, now), 'overdue');
  assert.equal(getFollowUpState({ ...base!, dueAt: local(2026, 7, 24, 16).toISOString() }, now), 'scheduled');
});

test('a task the DB already flagged Overdue is overdue even with a future due date', () => {
  const now = local(2026, 7, 23, 10);
  const summary = summarizeDealFollowUps([
    task({ status: 'Overdue', due_at: local(2026, 7, 30, 9).toISOString() }),
  ]).get('deal-1');
  assert.equal(getFollowUpState(summary, now), 'overdue');
});

test('tasks with unparseable due dates are excluded entirely', () => {
  // If they were included, the stat row (map.has) and board tone (state) would disagree
  const summaries = summarizeDealFollowUps([
    task({ id: 'garbage', due_at: 'not-a-date' }),
    task({ id: 'valid', deal_id: 'deal-2' }),
  ]);
  assert.equal(summaries.has('deal-1'), false);
  assert.equal(summaries.get('deal-2')?.id, 'valid');
});

test('empty and all-closed inputs produce an empty map', () => {
  assert.equal(summarizeDealFollowUps([]).size, 0);
  assert.equal(summarizeDealFollowUps([task({ status: 'Completed' }), task({ status: 'Cancelled' })]).size, 0);
});

test('formats due labels for every state', () => {
  const now = local(2026, 7, 23, 10);
  const base = summarizeDealFollowUps([task({ due_at: local(2026, 7, 23, 16).toISOString() })]).get('deal-1')!;

  assert.equal(formatFollowUpDue(null, now), 'Not scheduled');
  assert.equal(formatFollowUpDue({ ...base, dueAt: 'not-a-date' }, now), 'Not scheduled');
  assert.match(formatFollowUpDue(base, now), /^Today, /);
  assert.match(formatFollowUpDue({ ...base, dueAt: local(2026, 7, 22, 9).toISOString() }, now), /^Overdue · /);
  assert.match(formatFollowUpDue({ ...base, dueAt: local(2026, 7, 28, 9).toISOString() }, now), /Jul 28/);
});

test('defaults a new follow-up to 9:00 AM on the next local day', () => {
  assert.equal(
    defaultFollowUpInputValue(new Date(2026, 6, 23, 16, 45)),
    '2026-07-24T09:00',
  );
});
