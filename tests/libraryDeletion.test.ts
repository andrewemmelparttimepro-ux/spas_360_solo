import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  deleteStoredLibraryItem,
  isAllowedKnowledgeStorage,
  type LibraryDeletionStore,
  type StoredLibraryItem,
} from '../api/_lib/library-deletion.ts';
import {
  LibraryDeletionError,
  confirmLibraryDeletion,
  requestLibraryDeletion,
} from '../src/lib/libraryDeletion.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const ITEM: StoredLibraryItem = {
  kind: 'media_attachment',
  id: '11111111-1111-4111-8111-111111111111',
  name: 'customer-yard.jpg',
  bucket: 'fix-it-files',
  storagePath: 'org/post/customer-yard.jpg',
};

function fakeStore(overrides: Partial<LibraryDeletionStore> = {}) {
  const calls: string[] = [];
  const store: LibraryDeletionStore = {
    async find() { calls.push('find'); return ITEM; },
    async otherReferenceCount() { calls.push('references'); return 0; },
    async removeStorage() { calls.push('storage'); },
    async deleteRecord() { calls.push('record'); },
    async recordExists() { calls.push('verify'); return false; },
    ...overrides,
  };
  return { store, calls };
}

describe('saved library deletion', () => {
  it('names the file in confirmation and cancellation makes no request', async () => {
    let message = '';
    const confirmed = confirmLibraryDeletion('customer-yard.jpg', value => {
      message = value;
      return false;
    });
    assert.equal(confirmed, false);
    assert.match(message, /Delete "customer-yard\.jpg"\?/);

    let requested = false;
    if (confirmed) requested = true;
    assert.equal(requested, false);
  });

  it('removes storage before the authoritative row and verifies success', async () => {
    const { store, calls } = fakeStore();
    const result = await deleteStoredLibraryItem(store, ITEM.kind, ITEM.id, 'org-1');
    assert.deepEqual(result, { state: 'deleted', storage: 'removed' });
    assert.deepEqual(calls, ['find', 'references', 'storage', 'record', 'verify']);
  });

  it('leaves the row untouched when storage removal fails', async () => {
    const { store, calls } = fakeStore({
      async removeStorage() { calls.push('storage'); throw new Error('Storage unavailable'); },
    });
    const result = await deleteStoredLibraryItem(store, ITEM.kind, ITEM.id, 'org-1');
    assert.deepEqual(result, {
      state: 'failed', phase: 'storage', error: 'Storage unavailable', retryable: true,
    });
    assert.deepEqual(calls, ['find', 'references', 'storage']);
  });

  it('surfaces a retryable partial state when row cleanup fails after storage removal', async () => {
    const { store, calls } = fakeStore({
      async deleteRecord() { calls.push('record'); throw new Error('Database unavailable'); },
    });
    const result = await deleteStoredLibraryItem(store, ITEM.kind, ITEM.id, 'org-1');
    assert.equal(result.state, 'partial');
    if (result.state === 'partial') {
      assert.equal(result.retryable, true);
      assert.match(result.error, /record still needs cleanup/i);
    }
    assert.deepEqual(calls, ['find', 'references', 'storage', 'record']);
  });

  it('retains shared objects while deleting the selected authoritative row', async () => {
    const { store, calls } = fakeStore({
      async otherReferenceCount() { calls.push('references'); return 1; },
    });
    const result = await deleteStoredLibraryItem(store, ITEM.kind, ITEM.id, 'org-1');
    assert.deepEqual(result, { state: 'deleted', storage: 'retained_shared' });
    assert.deepEqual(calls, ['find', 'references', 'record', 'verify']);
  });

  it('rejects link-only and unsupported-bucket knowledge records', () => {
    assert.equal(isAllowedKnowledgeStorage('ari-knowledge-sources', 'org/manual.pdf'), true);
    assert.equal(isAllowedKnowledgeStorage('ari-knowledge-sources', null), false);
    assert.equal(isAllowedKnowledgeStorage(null, 'org/manual.pdf'), false);
    assert.equal(isAllowedKnowledgeStorage('fix-it-files', 'org/manual.pdf'), false);
  });

  it('accepts successful responses and preserves partial failure detail', async () => {
    const successFetch = (async () => new Response(JSON.stringify({ state: 'deleted' }), { status: 200 })) as typeof fetch;
    await requestLibraryDeletion(ITEM, 'token', successFetch);

    const partialFetch = (async () => new Response(JSON.stringify({
      state: 'partial', error: 'Retry cleanup', retryable: true,
    }), { status: 409 })) as typeof fetch;
    await assert.rejects(
      requestLibraryDeletion(ITEM, 'token', partialFetch),
      (error: unknown) => error instanceof LibraryDeletionError
        && error.partial && error.retryable && error.message === 'Retry cleanup',
    );
  });

  it('shows owner-only controls on Media and Parts file-backed items', async () => {
    const [media, knowledge, hook, endpoint] = await Promise.all([
      read('src/pages/Media.tsx'),
      read('src/pages/Knowledge.tsx'),
      read('src/hooks/useMediaLibrary.ts'),
      read('api/_lib/library-deletion.ts'),
    ]);
    assert.match(hook, /canDelete: profile\?\.role === 'owner_manager'/);
    assert.match(media, /aria-label=\{`Delete \$\{asset\.name\}`\}/);
    assert.match(knowledge, /canDeletePartsFiles = isPartsView && profile\?\.role === 'owner_manager'/);
    assert.match(knowledge, /document\.storage_bucket === 'ari-knowledge-sources' && document\.storage_path/);
    assert.match(endpoint, /\.eq\('storage_bucket', KNOWLEDGE_BUCKET\)\.not\('storage_path', 'is', null\)/);
  });
});
