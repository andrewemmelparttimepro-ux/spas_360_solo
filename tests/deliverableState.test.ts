import assert from 'node:assert/strict';
import { test } from 'node:test';
import { textDeliverableState } from '../api/_lib/deliverableState.ts';
test('greetings and owner-scope refusals stay conversations', () => {
  assert.equal(textDeliverableState('Hello', 'Hi. Want me to draft a text message?'), null);
  assert.equal(textDeliverableState('How many users signed in?', "I'm here to help you sell and serve"), null);
});
test('unfinished email is awaiting input; concrete body remains a draft, never sent', () => {
  assert.deepEqual(textDeliverableState('Write an email for me', 'Which customer should this email go to?'), { kind: 'email', status: 'needs_input' });
  assert.deepEqual(textDeliverableState('Write an email to Pat', 'Subject: Your spa\n\nHi Pat,\nYour quote is attached.'), { kind: 'email', status: 'draft' });
  assert.deepEqual(textDeliverableState('Write an email', 'Subject: Quote\nHi [CONFIRM: customer],'), { kind: 'email', status: 'needs_input' });
});
