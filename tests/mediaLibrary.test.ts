import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  MEDIA_LIBRARY_POST_ID,
  formatMediaLibrarySize,
  isSafeMediaPreview,
  mediaLibraryKind,
} from '../src/lib/mediaLibrary.ts';

const read = (relativePath: string) => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Media library file handling', () => {
  it('classifies images, PDFs, and documents without embedding SVG uploads', () => {
    assert.equal(mediaLibraryKind('photo.JPG', 'image/jpeg'), 'image');
    assert.equal(mediaLibraryKind('animated.gif', 'image/gif'), 'image');
    assert.equal(mediaLibraryKind('drawing.svg', 'image/svg+xml'), 'image');
    assert.equal(mediaLibraryKind('manual.pdf', 'application/pdf'), 'pdf');
    assert.equal(mediaLibraryKind('notes.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'), 'document');
    assert.equal(isSafeMediaPreview('animated.gif', 'image/gif'), true);
    assert.equal(isSafeMediaPreview('drawing.svg', 'image/svg+xml'), false);
    assert.equal(formatMediaLibrarySize('29142840'), '28 MB');
  });

  it('scopes runtime reads to the exact human-created source post and report files', async () => {
    assert.equal(MEDIA_LIBRARY_POST_ID, 'bb5d7e0d-8aca-4ac8-890a-108f8f6133e3');
    const hook = await read('src/hooks/useMediaLibrary.ts');
    assert.match(hook, /\.eq\('id', MEDIA_LIBRARY_POST_ID\)/);
    assert.match(hook, /\.eq\('post_id', MEDIA_LIBRARY_POST_ID\)/);
    assert.match(hook, /\.eq\('org_id', profile\.org_id\)/);
    assert.match(hook, /\.eq\('purpose', 'report'\)/);
    assert.match(hook, /\.is\('comment_id', null\)/);
    assert.match(hook, /createSignedUrls\(paths, SIGNED_URL_SECONDS\)/);
    assert.doesNotMatch(hook, /select\([^\n]*\burl\b/);
  });
});
