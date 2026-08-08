import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('customer Notes is not used for operational audit messages', () => {
  const operationalSurfaces = [
    '../src/pages/ContactDetail.tsx',
    '../src/components/QuickDealModal.tsx',
    '../src/pages/Deals.tsx',
  ];

  for (const path of operationalSurfaces) {
    const contents = source(path);
    assert.doesNotMatch(contents, /from\(['"]notes['"]\)\.insert\s*\(/, path);
  }

  const wizard = source('../src/components/NewCustomerWizard.tsx');
  assert.doesNotMatch(wizard, /Deal entered by/);
  assert.match(wizard, /body:\s*firstNote\.trim\(\)/);

  const allSurfaces = operationalSurfaces.map(source).join('\n') + wizard;
  assert.doesNotMatch(allSurfaces, /updated .* remains the assigned salesperson/);
  assert.doesNotMatch(allSurfaces, /reassigned this customer/);
  assert.doesNotMatch(allSurfaces, /attached .* to this deal/);
});

test('manual customer notes still save the signed-in author', () => {
  const hook = source('../src/hooks/useNotes.ts');
  assert.match(hook, /from\(['"]notes['"]\)/);
  assert.match(hook, /body,/);
  assert.match(hook, /created_by:\s*profile\.id/);
  assert.match(hook, /contact_id:\s*ids\.contactId/);
});

test('customer notes render both author and created date', () => {
  const detail = source('../src/pages/ContactDetail.tsx');
  assert.match(detail, /n\.author_name/);
  assert.match(detail, /new Date\(n\.created_at\)\.toLocaleDateString\(\)/);
});

test('cross-owner deal creation still sends the assigned salesperson a notification', () => {
  for (const path of ['../src/components/QuickDealModal.tsx', '../src/components/NewCustomerWizard.tsx']) {
    const contents = source(path);
    assert.match(contents, /from\(['"]notifications['"]\)\.insert\s*\(/, path);
    assert.match(contents, /user_id:\s*creditTo/, path);
  }
});
