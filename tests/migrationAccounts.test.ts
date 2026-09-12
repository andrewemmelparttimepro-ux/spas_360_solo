import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chooseMigrationConnection, jobberReadQuery } from '../api/_lib/migration-selection.ts';

test('two Jobber stores require an explicit account and cannot select a foreign account', () => {
  const stores = [{ id: 'minot' }, { id: 'bismarck' }];
  assert.throws(() => chooseMigrationConnection(stores), /Select the source account/);
  assert.equal(chooseMigrationConnection(stores, 'bismarck'), stores[1]);
  assert.throws(() => chooseMigrationConnection(stores, 'another-org'), /does not belong/);
  assert.equal(chooseMigrationConnection([stores[0]]), stores[0]);
});

test('the extraction endpoint rejects writes even after a read operation', () => {
  assert.equal(jobberReadQuery('query Inventory { account { id } }'), 'query Inventory { account { id } }');
  for (const query of ['mutation Delete { clientDelete }', 'query Read { account { id } } mutation Write { clientCreate }', 'subscription Events { event }', 'query '.repeat(50000)]) {
    assert.throws(() => jobberReadQuery(query), /read queries/);
  }
});
