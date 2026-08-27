import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Schedule New Job customer search', () => {
  it('uses a searchable listbox backed by the complete paginated contact set', async () => {
    const [service, contactsHook] = await Promise.all([
      read('src/pages/Service.tsx'),
      read('src/hooks/useContacts.ts'),
    ]);

    assert.match(service, /function CustomerCombobox\(/);
    assert.match(service, /role="combobox"/);
    assert.match(service, /aria-autocomplete="list"/);
    assert.match(service, /filterCustomersByNamePrefix\(customers, effectiveQuery\)/);
    assert.doesNotMatch(service, /filterCustomersByNamePrefix\(customers, effectiveQuery\)\.slice/);
    assert.match(contactsHook, /for \(let from = 0; ; from \+= pageSize\)/);
    assert.match(contactsHook, /\.range\(from, from \+ pageSize - 1\)/);
  });

  it('supports pointer and keyboard selection and writes the selected contact id', async () => {
    const service = await read('src/pages/Service.tsx');

    assert.match(service, /event\.key === 'ArrowDown'/);
    assert.match(service, /event\.key === 'ArrowUp'/);
    assert.match(service, /event\.key === 'Enter' && open && activeCustomer/);
    assert.match(service, /onClick=\{\(\) => choose\(customer\)\}/);
    assert.match(service, /onSelect\(customer\.id\)/);
    assert.match(service, /setNewJob\(current => \(\{ \.\.\.current, contact_id: contactId \}\)\)/);
  });

  it('retains externally prefilled customers while allowing a fresh search', async () => {
    const service = await read('src/pages/Service.tsx');

    assert.match(service, /customers\.find\(customer => customer\.id === selectedId\)/);
    assert.match(service, /if \(!open\) setQuery\(selectedLabel\)/);
    assert.match(service, /const effectiveQuery = selected && query === selectedLabel \? '' : query/);
    assert.match(service, /if \(selected\) event\.currentTarget\.select\(\)/);
  });
});
