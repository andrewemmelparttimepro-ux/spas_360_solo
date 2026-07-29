import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  filterCustomersByNamePrefix,
  matchesCustomerNamePrefix,
  normalizeCustomerNameQuery,
} from './customerSearch.ts';

const customers = [
  { id: '1', first_name: 'Lucas', last_name: 'Borgerson' },
  { id: '2', first_name: 'Lori', last_name: 'Wentz' },
  { id: '3', first_name: 'Lori', last_name: 'Soltis' },
  { id: '4', first_name: 'Michael', last_name: 'Anderson' },
  { id: '5', first_name: 'Mick', last_name: 'Carlson' },
  { id: '6', first_name: 'Michelle', last_name: 'Young' },
  { id: '7', first_name: 'Brandon', last_name: 'Solem' },
];

describe('customer exact-prefix search', () => {
  it('returns only first-name prefix matches and never retains unrelated leading rows', () => {
    assert.deepEqual(
      filterCustomersByNamePrefix(customers, 'Mic').map(customer => customer.id),
      ['4', '5', '6'],
    );
  });

  it('matches last-name and full-name prefixes', () => {
    assert.equal(matchesCustomerNamePrefix(customers[2], 'sol'), true);
    assert.equal(matchesCustomerNamePrefix(customers[6], 'Brandon Sol'), true);
  });

  it('does not treat a middle-of-name substring as a prefix', () => {
    assert.equal(matchesCustomerNamePrefix(customers[3], 'cha'), false);
    assert.deepEqual(filterCustomersByNamePrefix(customers, 'cha'), []);
  });

  it('normalizes case and repeated surrounding whitespace', () => {
    assert.equal(normalizeCustomerNameQuery('  BRANDON   SOL  '), 'brandon sol');
    assert.equal(matchesCustomerNamePrefix(customers[6], '  BRANDON   SOL  '), true);
  });

  it('keeps the complete list for an empty query', () => {
    assert.deepEqual(filterCustomersByNamePrefix(customers, '   '), customers);
  });
});
