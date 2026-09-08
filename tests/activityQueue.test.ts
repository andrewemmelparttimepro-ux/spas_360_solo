import test from 'node:test';
import assert from 'node:assert/strict';
import { ActivityQueue, type ActivityEvent } from '../src/lib/activityQueue.ts';
const event = (id: string, userId = 'staff'): ActivityEvent => ({ id, userId, sessionId: 'session', route: '/deals', label: 'Deals', release: 'release', attempts: 0 });

test('RPC thenables are consumed and a successful event is removed', async () => {
  const queue = new ActivityQueue(); queue.enqueue(event('one'));
  let sent = 0;
  await queue.flush('staff', async () => { await { then(resolve: (value: boolean) => void) { sent++; resolve(true); } }; return true; });
  assert.equal(sent, 1); assert.equal(queue.size, 0);
});
test('transient failure retries the identical operation; overlapping flushes do not send twice', async () => {
  const queue = new ActivityQueue(); queue.enqueue(event('one')); queue.enqueue(event('one'));
  const ids: string[] = [];
  await queue.flush('staff', async e => { ids.push(e.id); return false; });
  await Promise.all([queue.flush('staff', async e => { ids.push(e.id); return true; }), queue.flush('staff', async () => { throw new Error('duplicate'); })]);
  assert.deepEqual(ids, ['one','one']); assert.equal(queue.size, 0);
});
test('retries stop after three attempts and sign-in change discards another user events', async () => {
  const queue = new ActivityQueue(); queue.enqueue(event('one'));
  for (let i=0;i<3;i++) await queue.flush('staff', async () => false);
  assert.equal(queue.size, 0);
  queue.enqueue(event('old','previous-user'));
  await queue.flush('staff', async () => { throw new Error('must not send another user event'); });
  assert.equal(queue.size, 0);
});
