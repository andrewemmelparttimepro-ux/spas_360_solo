import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

describe('Fix-It proof-before-status workflow', () => {
  it('lets an active claimed item receive validation proof before Mark fixed', async () => {
    const source = await readFile(new URL('../src/components/FixItFeed.tsx', import.meta.url), 'utf8');
    const activeControls = source.match(/\{\['open', 'in_progress'\][\s\S]*?\{\['fixed', 'agent_done'\]/)?.[0] ?? '';

    assert.match(activeControls, /setValidationPostId\(post\.id\)/);
    assert.match(activeControls, /post\.validationProof \? 'View proof' : 'Add proof'/);
    assert.match(activeControls, /markFixed\(post\)/);
    assert.ok(activeControls.indexOf('setValidationPostId(post.id)') < activeControls.indexOf('markFixed(post)'));
  });
});
