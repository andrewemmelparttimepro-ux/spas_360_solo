import type { SupabaseClient } from '@supabase/supabase-js';

export type LibraryDeleteKind = 'media_attachment' | 'parts_attachment' | 'knowledge_document';

export type StoredLibraryItem = {
  kind: LibraryDeleteKind;
  id: string;
  name: string;
  bucket: string | null;
  storagePath: string | null;
};

export type LibraryDeletionStore = {
  find(kind: LibraryDeleteKind, id: string, orgId: string): Promise<StoredLibraryItem | null>;
  otherReferenceCount(item: StoredLibraryItem, orgId: string): Promise<number>;
  removeStorage(bucket: string, path: string): Promise<void>;
  deleteRecord(item: StoredLibraryItem, orgId: string): Promise<void>;
  recordExists(item: StoredLibraryItem, orgId: string): Promise<boolean>;
};

export type LibraryDeletionResult =
  | { state: 'deleted'; storage: 'removed' | 'retained_shared' | 'not_present' }
  | { state: 'failed'; phase: 'lookup' | 'storage'; error: string; retryable: boolean }
  | { state: 'partial'; phase: 'record'; error: string; retryable: true };

const MEDIA_LIBRARY_POST_ID = 'bb5d7e0d-8aca-4ac8-890a-108f8f6133e3';
const PARTS_ATTACHMENTS = new Map([
  ['da51ac8d-0368-40a5-b196-3824aa33e4e5', '3bc7f944-5dcc-4c66-9382-b70cd07964d3'],
  ['e5a191d6-942c-4750-8d7e-79003e545bf6', '85507a1f-9b9e-487c-b7fb-0dd359ca4bfa'],
]);
const FIX_IT_BUCKET = 'fix-it-files';
const KNOWLEDGE_BUCKET = 'ari-knowledge-sources';

export function isAllowedKnowledgeStorage(bucket: string | null, path: string | null): boolean {
  return bucket === KNOWLEDGE_BUCKET && Boolean(path?.trim());
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export async function deleteStoredLibraryItem(
  store: LibraryDeletionStore,
  kind: LibraryDeleteKind,
  id: string,
  orgId: string,
): Promise<LibraryDeletionResult> {
  let item: StoredLibraryItem | null;
  try {
    item = await store.find(kind, id, orgId);
  } catch (error) {
    return { state: 'failed', phase: 'lookup', error: errorText(error, 'The file could not be found.'), retryable: true };
  }
  if (!item) return { state: 'failed', phase: 'lookup', error: 'The file is no longer available.', retryable: false };

  let storage: 'removed' | 'retained_shared' | 'not_present' = 'not_present';
  if (item.bucket && item.storagePath) {
    try {
      const references = await store.otherReferenceCount(item, orgId);
      if (references > 0) {
        storage = 'retained_shared';
      } else {
        await store.removeStorage(item.bucket, item.storagePath);
        storage = 'removed';
      }
    } catch (error) {
      return {
        state: 'failed',
        phase: 'storage',
        error: errorText(error, 'The private file could not be removed. Nothing was removed from the library.'),
        retryable: true,
      };
    }
  }

  try {
    await store.deleteRecord(item, orgId);
    if (await store.recordExists(item, orgId)) throw new Error('The library record still exists after deletion.');
  } catch (error) {
    return {
      state: 'partial',
      phase: 'record',
      error: storage === 'removed'
        ? 'The private file was removed, but its library record still needs cleanup. Retry deletion to reconcile it.'
        : errorText(error, 'The library record could not be removed. Please retry.'),
      retryable: true,
    };
  }

  return { state: 'deleted', storage };
}

type AttachmentRow = {
  id: string;
  post_id: string;
  name: string;
  storage_path: string | null;
};

type KnowledgeRow = {
  id: string;
  title: string;
  storage_bucket: string | null;
  storage_path: string | null;
};

function throwIf(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

export function supabaseLibraryDeletionStore(service: SupabaseClient): LibraryDeletionStore {
  return {
    async find(kind, id, orgId) {
      if (kind === 'knowledge_document') {
        const { data, error } = await service.from('knowledge_documents')
          .select('id,title,storage_bucket,storage_path')
          .eq('id', id).eq('org_id', orgId).eq('status', 'active')
          .eq('storage_bucket', KNOWLEDGE_BUCKET).not('storage_path', 'is', null).maybeSingle();
        throwIf(error, 'The Parts source could not be loaded.');
        const row = data as KnowledgeRow | null;
        return row && isAllowedKnowledgeStorage(row.storage_bucket, row.storage_path) ? {
          kind,
          id: row.id,
          name: row.title,
          bucket: row.storage_bucket,
          storagePath: row.storage_path,
        } : null;
      }

      const { data, error } = await service.from('fix_it_attachments')
        .select('id,post_id,name,storage_path')
        .eq('id', id).eq('org_id', orgId).eq('purpose', 'report').is('comment_id', null).maybeSingle();
      throwIf(error, 'The attachment could not be loaded.');
      const row = data as AttachmentRow | null;
      if (!row) return null;
      if (kind === 'media_attachment' && row.post_id !== MEDIA_LIBRARY_POST_ID) return null;
      if (kind === 'parts_attachment' && PARTS_ATTACHMENTS.get(row.id) !== row.post_id) return null;
      return { kind, id: row.id, name: row.name, bucket: FIX_IT_BUCKET, storagePath: row.storage_path };
    },

    async otherReferenceCount(item) {
      if (!item.bucket || !item.storagePath) return 0;
      let attachmentCount = 0;
      if (item.bucket === FIX_IT_BUCKET) {
        const attachmentResult = await service.from('fix_it_attachments').select('id', { count: 'exact', head: true })
          .eq('storage_path', item.storagePath)
          .neq('id', item.kind === 'knowledge_document' ? '00000000-0000-0000-0000-000000000000' : item.id);
        throwIf(attachmentResult.error, 'Attachment references could not be checked.');
        attachmentCount = attachmentResult.count ?? 0;
      }
      const documentResult = await service.from('knowledge_documents').select('id', { count: 'exact', head: true })
        .eq('storage_bucket', item.bucket).eq('storage_path', item.storagePath)
        .neq('id', item.kind === 'knowledge_document' ? item.id : '00000000-0000-0000-0000-000000000000');
      throwIf(documentResult.error, 'Parts references could not be checked.');
      return attachmentCount + (documentResult.count ?? 0);
    },

    async removeStorage(bucket, path) {
      const { error } = await service.storage.from(bucket).remove([path]);
      throwIf(error, 'The private file could not be removed.');
    },

    async deleteRecord(item, orgId) {
      const table = item.kind === 'knowledge_document' ? 'knowledge_documents' : 'fix_it_attachments';
      const { data, error } = await service.from(table).delete().eq('id', item.id).eq('org_id', orgId).select('id');
      throwIf(error, 'The library record could not be removed.');
      if (!data || data.length !== 1) throw new Error('The library record was not removed.');
    },

    async recordExists(item, orgId) {
      const table = item.kind === 'knowledge_document' ? 'knowledge_documents' : 'fix_it_attachments';
      const { data, error } = await service.from(table).select('id').eq('id', item.id).eq('org_id', orgId).maybeSingle();
      throwIf(error, 'The deletion could not be verified.');
      return Boolean(data);
    },
  };
}
