import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');

describe('Parts PDF access contract', () => {
  it('scopes the catalog shelf and each query to the two exact human attachments', async () => {
    const knowledge = await read('src/pages/Knowledge.tsx');
    const definitions = knowledge.slice(
      knowledge.indexOf('const PARTS_PDF_RESOURCES'),
      knowledge.indexOf('] as const;', knowledge.indexOf('const PARTS_PDF_RESOURCES')),
    );

    assert.match(knowledge, /const isPartsView = defaultType === 'parts_catalog'/);
    assert.equal(definitions.match(/attachmentId:/g)?.length, 2);
    assert.match(knowledge, /postId: '3bc7f944-5dcc-4c66-9382-b70cd07964d3'/);
    assert.match(knowledge, /attachmentId: 'da51ac8d-0368-40a5-b196-3824aa33e4e5'/);
    assert.match(knowledge, /displayName: 'Sun Parts 2016 \+'/);
    assert.match(knowledge, /postId: '85507a1f-9b9e-487c-b7fb-0dd359ca4bfa'/);
    assert.match(knowledge, /attachmentId: 'e5a191d6-942c-4750-8d7e-79003e545bf6'/);
    assert.match(knowledge, /displayName: 'Sundance Parts 2015 Volume 1'/);
    assert.match(knowledge, /PARTS_PDF_RESOURCES\.map\(async resource =>[\s\S]*?\.from\('fix_it_attachments'\)[\s\S]*?\.eq\('id', resource\.attachmentId\)[\s\S]*?\.eq\('post_id', resource\.postId\)[\s\S]*?\.eq\('org_id', profile\.org_id\)[\s\S]*?\.eq\('purpose', 'report'\)/);
    assert.match(knowledge, /\{isPartsView && \([\s\S]*?partsPdfs\.map\(resource => \([\s\S]*?resource\.displayName[\s\S]*?Open PDF/);
  });

  it('creates a short-lived private signed URL only when the Parts action runs', async () => {
    const knowledge = await read('src/pages/Knowledge.tsx');
    const openHandler = knowledge.slice(knowledge.indexOf('const openPartsPdf'));

    assert.match(openHandler, /\.from\(PARTS_PDF_BUCKET\)[\s\S]*?\.createSignedUrl\(resource\.attachment\.storage_path, 120\)/);
    assert.match(openHandler, /item\.key === resource\.key[\s\S]*?opening: true/);
    assert.match(openHandler, /pendingWindow\.location\.replace\(data\.signedUrl\)/);
    assert.doesNotMatch(knowledge, /getPublicUrl\(/);
    assert.doesNotMatch(knowledge, /localStorage[\s\S]*signedUrl/);
  });
});
