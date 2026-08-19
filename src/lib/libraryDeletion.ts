export type LibraryDeleteKind = 'media_attachment' | 'parts_attachment' | 'knowledge_document';

export type LibraryDeleteTarget = {
  kind: LibraryDeleteKind;
  id: string;
  name: string;
};

type DeleteResponse = {
  state?: 'deleted' | 'failed' | 'partial';
  error?: string;
  retryable?: boolean;
};

export class LibraryDeletionError extends Error {
  readonly retryable: boolean;
  readonly partial: boolean;

  constructor(message: string, options: { retryable?: boolean; partial?: boolean } = {}) {
    super(message);
    this.name = 'LibraryDeletionError';
    this.retryable = options.retryable ?? false;
    this.partial = options.partial ?? false;
  }
}

export function confirmLibraryDeletion(
  name: string,
  confirm: (message: string) => boolean = window.confirm,
): boolean {
  return confirm(`Delete "${name}"? This permanently removes the saved file and cannot be undone.`);
}

export async function requestLibraryDeletion(
  target: LibraryDeleteTarget,
  accessToken: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const response = await fetcher('/api/library/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ kind: target.kind, id: target.id }),
  });
  const body = await response.json().catch(() => ({})) as DeleteResponse;
  if (!response.ok || body.state !== 'deleted') {
    throw new LibraryDeletionError(
      body.error || 'The file could not be deleted. Please try again.',
      { retryable: body.retryable, partial: body.state === 'partial' },
    );
  }
}
