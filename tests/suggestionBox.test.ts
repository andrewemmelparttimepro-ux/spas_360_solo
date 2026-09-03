import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  canPromoteSuggestion,
  canReviewSuggestions,
  fixItPostBodyForSuggestion,
  normalizeSuggestionBody,
  SUGGESTION_MAX_LENGTH,
  SUGGESTION_STATUS,
} from '../src/lib/suggestions.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Suggestion Box access model', () => {
  it('gives review controls only to owner accounts', () => {
    assert.equal(canReviewSuggestions('owner_manager'), true);
    assert.equal(canReviewSuggestions('service_manager'), false);
    assert.equal(canReviewSuggestions('salesperson'), false);
    assert.equal(canReviewSuggestions('technician'), false);
    assert.equal(canReviewSuggestions(null), false);
  });

  it('notifies every owner through the in-app notification inbox after every submission', async () => {
    const [migration, header] = await Promise.all([
      read('supabase/migrations/20260831185000_limit_fix_it_and_route_suggestions.sql'),
      read('src/components/layout/Header.tsx'),
    ]);

    assert.match(migration, /create trigger suggestions_notify_brandon/i);
    assert.match(migration, /insert into public\.notifications/i);
    // 2026-09-03: Matt and Brandon are both owners; every owner account is notified.
    const owners = await read('supabase/migrations/20260903180000_suggestions_notify_all_owners.sql');
    assert.match(owners, /role = 'owner_manager'/);
    assert.doesNotMatch(owners, /brandon_solem@hotmail\.com/);
    assert.match(migration, /'\/dashboard\?suggestions=open'/);
    assert.match(header, /params\.get\('suggestions'\) === 'open'/);
  });

  it('normalizes human input to the database length boundary', () => {
    assert.equal(normalizeSuggestionBody('  Better mobile filters  '), 'Better mobile filters');
    assert.equal(normalizeSuggestionBody('x'.repeat(SUGGESTION_MAX_LENGTH + 10)).length, SUGGESTION_MAX_LENGTH);
    assert.deepEqual(Object.keys(SUGGESTION_STATUS), ['pending', 'reviewed', 'declined', 'promoted']);
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
    // 2026-08-08: the header entry point is a quiet icon (title + aria-label),
    // not a labeled pill — hierarchy pass per Andrew. 2026-09-03: visible on phones too.
    assert.match(header, /title="Suggestion Box"/);
    assert.doesNotMatch(header, /hover:bg-ink-800 transition-colors hidden sm:block"\n\s+aria-label="Open Suggestion Box"/);
    assert.match(component, /from\('suggestions'\)\.insert/);
    assert.match(component, /isManager && \(/);
    assert.match(component, /role="dialog"/);
    assert.match(component, /sm:items-center/);
  });

  it('lets an owner send an accepted suggestion to the Fix-It Feed with one human click and tells the author', async () => {
    const [component, migration] = await Promise.all([
      read('src/components/SuggestionBox.tsx'),
      read('supabase/migrations/20260903151500_suggestion_promotion.sql'),
    ]);
    assert.equal(canPromoteSuggestion('owner_manager', true), true);
    assert.equal(canPromoteSuggestion('owner_manager', false), false);
    assert.equal(canPromoteSuggestion('service_manager', true), false);
    assert.match(fixItPostBodyForSuggestion('Ben Magnuson', '  Add a parts reorder button  '), /^Suggestion from Ben Magnuson \(via the Suggestion Box\):\n\nAdd a parts reorder button$/);
    assert.match(component, /from\('fix_it_posts'\)/);
    assert.match(component, /status: 'promoted'/);
    assert.match(component, /Send to Fix-It Feed/);
    assert.match(component, /canPromote && suggestion\.status !== 'promoted'/);
    assert.match(migration, /status in \('pending', 'reviewed', 'declined', 'promoted'\)/);
    assert.match(migration, /fix_it_post_id uuid references public\.fix_it_posts\(id\)/);
    assert.match(migration, /create trigger suggestions_notify_author/);
    assert.match(migration, /'Your suggestion is being built'/);
    assert.doesNotMatch(migration, /\b(insert into|update|delete from)\s+public\.fix_it_/i);
  });
});
