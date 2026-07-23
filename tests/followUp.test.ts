import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultFollowUpInputValue,
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
  const now = new Date('2026-07-23T15:00:00.000Z');
  const base = summarizeDealFollowUps([task({ due_at: '2026-07-23T16:00:00.000Z' })]).get('deal-1');

  assert.equal(getFollowUpState(null, now), 'missing');
  assert.equal(getFollowUpState(base, now), 'today');
  assert.equal(getFollowUpState({ ...base!, dueAt: '2026-07-23T14:00:00.000Z' }, now), 'overdue');
  assert.equal(getFollowUpState({ ...base!, dueAt: '2026-07-24T16:00:00.000Z' }, now), 'scheduled');
});

test('defaults a new follow-up to 9:00 AM on the next local day', () => {
  assert.equal(
    defaultFollowUpInputValue(new Date(2026, 6, 23, 16, 45)),
    '2026-07-24T09:00',
  );
});
