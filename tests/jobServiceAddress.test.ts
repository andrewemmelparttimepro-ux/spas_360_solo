import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { jobServiceContact } from '../src/lib/jobContact.ts';

test('schedule uses the service property without changing the customer mailing address', () => {
  const contact = { first_name: 'Customer', last_name: '', phone: '7015550100', mailing_address: 'Old mailing address' };
  const result = jobServiceContact(contact, { address: 'Current service address' });
  assert.equal(result?.mailing_address, 'Current service address');
  assert.equal(contact.mailing_address, 'Old mailing address');
  assert.equal(result?.phone, contact.phone);
  assert.equal(jobServiceContact(contact, null)?.mailing_address, 'Old mailing address');
  assert.equal(jobServiceContact(null, { address: 'Current service address' }), null);
});
