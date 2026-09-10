import assert from 'node:assert/strict';
import { test } from 'node:test';
import { knowledgeSearchTitle } from '../src/lib/knowledgeDocuments.ts';

test('warranty search identifies the actual manual instead of a glued PDF page heading', () => {
  const result = {
    title: "Master Spas Twilight Series Owner's Manual — 2026",
    citation_label: "Master Spas Twilight Owner's Manual (2026)",
    heading: '83DO NOT DIVE.', page_start: 85,
    content: '83DO NOT DIVE. Warranty coverage',
  };
  assert.equal(knowledgeSearchTitle(result), result.title);
  assert.equal(result.heading, '83DO NOT DIVE.');
  assert.equal(result.page_start, 85);
  assert.equal(result.content, '83DO NOT DIVE. Warranty coverage');
});
test('uses citation metadata when a source has no title', () => {
  assert.equal(knowledgeSearchTitle({ title: ' ', citation_label: 'Warranty reference' }), 'Warranty reference');
  assert.equal(knowledgeSearchTitle({ title: '', citation_label: null }), 'Untitled source');
});
