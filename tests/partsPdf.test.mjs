import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Parts PDF access contract', () => {
  it('scopes the catalog shelf and its query to the exact human attachment', async () => {
    const knowledge = await read('src/pages/Knowledge.tsx');

    assert.match(knowledge, /const isPartsView = defaultType === 'parts_catalog'/);
    assert.match(knowledge, /PARTS_PDF_POST_ID = '3bc7f944-5dcc-4c66-9382-b70cd07964d3'/);
    assert.match(knowledge, /PARTS_PDF_ATTACHMENT_ID = 'da51ac8d-0368-40a5-b196-3824aa33e4e5'/);
    assert.match(knowledge, /\.from\('fix_it_attachments'\)[\s\S]*?\.eq\('id', PARTS_PDF_ATTACHMENT_ID\)[\s\S]*?\.eq\('post_id', PARTS_PDF_POST_ID\)[\s\S]*?\.eq\('org_id', profile\.org_id\)[\s\S]*?\.eq\('purpose', 'report'\)/);
    assert.match(knowledge, /\{isPartsView && \([\s\S]*?Sun Parts 2016 \+[\s\S]*?Open PDF/);
  });

  it('creates a short-lived private signed URL only when the Parts action runs', async () => {
    const knowledge = await read('src/pages/Knowledge.tsx');
    const openHandler = knowledge.slice(knowledge.indexOf('const openPartsPdf'));

    assert.match(openHandler, /\.from\(PARTS_PDF_BUCKET\)[\s\S]*?\.createSignedUrl\(partsPdf\.storage_path, 120\)/);
    assert.match(openHandler, /pendingWindow\.location\.replace\(data\.signedUrl\)/);
    assert.doesNotMatch(knowledge, /getPublicUrl\(/);
    assert.doesNotMatch(knowledge, /localStorage[\s\S]*signedUrl/);
  });
});
