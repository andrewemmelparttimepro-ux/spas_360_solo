import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  signFixItAttachmentUrls,
  type AttachmentUrlSigner,
  type SignedUrlCacheEntry,
} from '../src/lib/fixItAttachmentUrls.ts';

describe('Fix-It attachment URL signing', () => {
  it('batches attachment signing and retries only paths omitted by the batch response', async () => {
    const batchCalls: string[][] = [];
    const retryCalls: string[] = [];
    const signer: AttachmentUrlSigner = {
      async createSignedUrls(paths) {
        batchCalls.push(paths);
        return { data: [{ path: paths[0], signedUrl: 'signed:first' }], error: null };
      },
      async createSignedUrl(path) {
        retryCalls.push(path);
        return { data: { signedUrl: `signed:${path}` }, error: null };
      },
    };

    const urls = await signFixItAttachmentUrls(['first', 'second', 'first'], signer, new Map(), 1_000);

    assert.deepEqual(batchCalls, [['first', 'second']]);
    assert.deepEqual(retryCalls, ['second']);
    assert.equal(urls.get('first'), 'signed:first');
    assert.equal(urls.get('second'), 'signed:second');
  });

  it('uses healthy cached URLs and retries after a failed batch without caching failures', async () => {
    const cache = new Map<string, SignedUrlCacheEntry>([
      ['cached', { url: 'signed:cached', expiresAt: 700_000 }],
    ]);
    const batchCalls: string[][] = [];
    const retryCalls: string[] = [];
    const signer: AttachmentUrlSigner = {
      async createSignedUrls(paths) {
        batchCalls.push(paths);
        return { data: null, error: new Error('temporary batch failure') };
      },
      async createSignedUrl(path) {
        retryCalls.push(path);
        return path === 'recovered'
          ? { data: { signedUrl: 'signed:recovered' }, error: null }
          : { data: null, error: new Error('still unavailable') };
      },
    };

    const urls = await signFixItAttachmentUrls(['cached', 'recovered', 'missing'], signer, cache, 1_000);

    assert.deepEqual(batchCalls, [['recovered', 'missing']]);
    assert.deepEqual(retryCalls, ['recovered', 'missing']);
    assert.equal(urls.get('cached'), 'signed:cached');
    assert.equal(urls.get('recovered'), 'signed:recovered');
    assert.equal(urls.has('missing'), false);
    assert.equal(cache.has('missing'), false);
  });
});
