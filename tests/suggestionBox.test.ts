import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  canReviewSuggestions,
  normalizeSuggestionBody,
  SUGGESTION_MAX_LENGTH,
  SUGGESTION_STATUS,
} from '../src/lib/suggestions.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Suggestion Box access model', () => {
  it('gives review controls only to manager roles', () => {
    assert.equal(canReviewSuggestions('owner_manager'), true);
    assert.equal(canReviewSuggestions('service_manager'), true);
    assert.equal(canReviewSuggestions('salesperson'), false);
    assert.equal(canReviewSuggestions('technician'), false);
    assert.equal(canReviewSuggestions(null), false);
  });

  it('normalizes human input to the database length boundary', () => {
    assert.equal(normalizeSuggestionBody('  Better mobile filters  '), 'Better mobile filters');
    assert.equal(normalizeSuggestionBody('x'.repeat(SUGGESTION_MAX_LENGTH + 10)).length, SUGGESTION_MAX_LENGTH);
    assert.deepEqual(Object.keys(SUGGESTION_STATUS), ['pending', 'reviewed', 'declined']);
  });

  it('uses a separate human-authored table with organization and ownership RLS', async () => {
    const migration = await read('supabase/migrations/20260807204223_suggestion_box.sql');

    assert.match(migration, /create table public\.suggestions/i);
    assert.match(migration, /alter table public\.suggestions enable row level security/i);
    assert.match(migration, /created_by = \(select auth\.uid\(\)\)/i);
    assert.match(migration, /org_id = \(select public\.auth_org\(\)\)/i);
    assert.match(migration, /auth_role\(\).*'owner_manager'.*'service_manager'/is);
    assert.match(migration, /grant insert \(org_id, body, created_by\)/i);
    assert.match(migration, /grant update \(status, reviewed_by, reviewed_at\)/i);
    assert.doesNotMatch(migration, /grant delete/i);
    assert.doesNotMatch(migration, /\b(insert into|update|delete from|alter table)\s+(public\.)?fix_it_/i);
  });

  it('exposes submission from the header and gates review actions in the component', async () => {
    const [header, component] = await Promise.all([
      read('src/components/layout/Header.tsx'),
      read('src/components/SuggestionBox.tsx'),
    ]);

    assert.match(header, /aria-label="Open Suggestion Box"/);
    assert.match(header, />Suggestion Box</);
    assert.match(component, /from\('suggestions'\)\.insert/);
    assert.match(component, /isManager && \(/);
    assert.match(component, /role="dialog"/);
    assert.match(component, /sm:items-center/);
  });
});
