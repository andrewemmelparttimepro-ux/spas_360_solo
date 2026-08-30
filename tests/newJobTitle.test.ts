import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { canReplaceNewJobTitle, newJobTitleForCustomer } from '../src/lib/newJobTitle.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Schedule New Job title prefill', () => {
  it('uses the selected customer first and last name with a note-ready suffix', () => {
    assert.equal(
      newJobTitleForCustomer({ first_name: 'Brandon', last_name: 'Solem' }),
      'Brandon Solem - ',
    );
  });

  it('updates empty and previously generated titles when the customer changes', () => {
    assert.equal(canReplaceNewJobTitle('', ''), true);
    assert.equal(canReplaceNewJobTitle('Brandon Solem - ', 'Brandon Solem - '), true);
  });

  it('preserves a manually edited title when the customer changes', () => {
    assert.equal(
      canReplaceNewJobTitle('Brandon Solem - delivery notes', 'Brandon Solem - '),
      false,
    );
  });

  it('applies the guarded customer title from the New Job customer selector', async () => {
    const service = await read('src/pages/Service.tsx');

    assert.match(service, /const auto = newJobTitleForCustomer\(c\)/);
    assert.match(service, /if \(!canReplaceNewJobTitle\(j\.title, autoTitleRef\.current\)\) return j/);
    assert.match(service, /if \(contactId\) applyAutoTitle\(contactId\)/);
    assert.doesNotMatch(service, /applyAutoTitle\(newJob\.contact_id/);
  });
});
