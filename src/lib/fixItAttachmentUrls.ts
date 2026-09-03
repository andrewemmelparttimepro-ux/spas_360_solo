const SIGNED_URL_SECONDS = 60 * 60;
const SIGNED_URL_BATCH_SIZE = 50;
const SIGNED_URL_RETRY_CONCURRENCY = 4;
const SIGNED_URL_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface SignedUrlCacheEntry {
  url: string;
  expiresAt: number;
}

interface SignedUrlRow {
  path?: string | null;
  signedUrl?: string | null;
}

interface SignedUrlResponse<T> {
  data: T | null;
  error: unknown;
}

export interface AttachmentUrlSigner {
  createSignedUrls: (paths: string[], expiresIn: number) => Promise<SignedUrlResponse<SignedUrlRow[]>>;
  createSignedUrl: (path: string, expiresIn: number) => Promise<SignedUrlResponse<{ signedUrl?: string | null }>>;
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function signFixItAttachmentUrls(
  paths: Array<string | null>,
  signer: AttachmentUrlSigner,
  cache: Map<string, SignedUrlCacheEntry>,
  now = Date.now(),
): Promise<Map<string, string>> {
  const uniquePaths = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const urls = new Map<string, string>();
  const unsignedPaths: string[] = [];

  for (const path of uniquePaths) {
    const cached = cache.get(path);
    if (cached && cached.expiresAt - now > SIGNED_URL_REFRESH_BUFFER_MS) urls.set(path, cached.url);
    else unsignedPaths.push(path);
  }

  for (const batch of chunks(unsignedPaths, SIGNED_URL_BATCH_SIZE)) {
    try {
      const { data, error } = await signer.createSignedUrls(batch, SIGNED_URL_SECONDS);
      if (!error) {
        for (const row of data ?? []) {
          if (row.path && row.signedUrl) urls.set(row.path, row.signedUrl);
        }
      }
    } catch {
      // Missing paths are retried below with the single-object endpoint.
    }
  }

  const missingPaths = unsignedPaths.filter(path => !urls.has(path));
  for (const retryBatch of chunks(missingPaths, SIGNED_URL_RETRY_CONCURRENCY)) {
    await Promise.all(retryBatch.map(async path => {
      try {
        const { data, error } = await signer.createSignedUrl(path, SIGNED_URL_SECONDS);
        if (!error && data?.signedUrl) urls.set(path, data.signedUrl);
      } catch {
        // Leave the URL absent so a later feed refresh can retry it.
      }
    }));
  }

  const expiresAt = now + SIGNED_URL_SECONDS * 1000;
  urls.forEach((url, path) => cache.set(path, { url, expiresAt }));
  return urls;
}
