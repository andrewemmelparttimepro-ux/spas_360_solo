import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { formatCustomerAddress } from '../src/lib/customerAddress.ts';
import { formatPhone } from '../src/lib/utils.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Customers table address', () => {
  it('uses one readable phone format without rewriting extensions or short values', () => {
    assert.equal(formatPhone('7016410155'), '(701) 641-0155');
    assert.equal(formatPhone('+1 (701) 641-0155'), '(701) 641-0155');
    assert.equal(formatPhone('701-641-0155 x22'), '701-641-0155 x22');
    assert.equal(formatPhone(null), '');
  });

  it('shows an explicit absence only when no stored address content exists', () => {
    assert.equal(formatCustomerAddress(null), 'Not provided');
    assert.equal(formatCustomerAddress(undefined), 'Not provided');
    assert.equal(formatCustomerAddress('   \n  '), 'Not provided');
  });

  it('preserves stored street, city, state, and ZIP content', () => {
    assert.equal(formatCustomerAddress('123 Main St, Bismarck, ND 58501'), '123 Main St, Bismarck, ND 58501');
    assert.equal(
      formatCustomerAddress('Suite 200\n456 North Ave\nMinot, ND 58701'),
      'Suite 200, 456 North Ave, Minot, ND 58701',
    );
  });

  it('puts Address between Customer and Phone and removes Status only from list view', async () => {
    const customers = await read('src/pages/Customers.tsx');
    const tableStart = customers.indexOf('<table');
    const tableEnd = customers.indexOf('// Shared health read');
    const table = customers.slice(tableStart, tableEnd);
    const rowStart = customers.indexOf('function CustomerRow');
    const cardStart = customers.indexOf('function CustomerCardView');
    const row = customers.slice(rowStart, cardStart);
    const cardView = customers.slice(cardStart);

    assert.match(table, />Customer<[\s\S]*>Address<[\s\S]*>Phone</);
    assert.doesNotMatch(table, />Status</);
    assert.match(row, /formatCustomerAddress\(c\.mailing_address\)/);
    assert.match(table, /min-w-\[1320px\]/);
    assert.match(cardView, /<Phone[\s\S]*\{formatPhone\(c\.phone\)\}/);
    assert.match(cardView, /formatDistanceToNow\(new Date\(c\.lastActivity\)/);
  });
});
