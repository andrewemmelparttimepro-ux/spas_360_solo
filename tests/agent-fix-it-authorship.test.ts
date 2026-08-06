import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import {
  createAgentTools,
  executeToolFrom,
  getOpenAITools,
  type ToolDefinition,
} from '../src/agent/toolFactory.ts';

function inertClient() {
  return new Proxy({}, {
    get() {
      throw new Error('The database must not be touched by an authorship-boundary refusal.');
    },
  }) as Parameters<typeof createAgentTools>[0];
}

function tools() {
  return createAgentTools(
    inertClient(),
    async () => 'human-user-id',
    async () => ({ outboxId: 'unused' }),
  );
}

describe('agent Fix-It authorship boundary', () => {
  it('does not expose create_fix_it_post in either tool catalogue shape', () => {
    const catalogue = tools();
    assert.equal(catalogue.some(tool => tool.name === 'create_fix_it_post'), false);
    assert.equal(
      getOpenAITools(catalogue).some(tool => tool.function.name === 'create_fix_it_post'),
      false,
    );
  });

  it('refuses create_fix_it_post even if a stale catalogue supplies an executor', async () => {
    let invoked = false;
    const staleTool: ToolDefinition = {
      name: 'create_fix_it_post',
      description: 'stale forbidden capability',
      parameters: {},
      execute: async () => {
        invoked = true;
        return { submitted: true };
      },
    };

    const result = await executeToolFrom([staleTool], 'create_fix_it_post', {});

    assert.equal(invoked, false);
    assert.deepEqual(result, {
      error: 'Agents cannot create or delegate Fix-It posts. A human must create the wall post in the Fix-It Feed.',
    });
  });

  it('refuses product/UI create_task requests with human-wall guidance and no write', async () => {
    const createTask = tools().find(tool => tool.name === 'create_task');
    assert.ok(createTask);

    for (const title of ['Fix the dashboard UI button', 'Product request: add a workflow']) {
      const result = await createTask.execute({ title, due_date: '2026-08-07' });
      assert.deepEqual(result, {
        error: 'Product and UI changes cannot be created as tasks. Agents cannot create or delegate Fix-It posts. A human must create the wall post in the Fix-It Feed.',
      });
    }
  });

  it('tells Ari to articulate requests while reserving wall-post authorship for humans', async () => {
    const promptSource = await readFile(
      new URL('../api/_lib/system-prompt.ts', import.meta.url),
      'utf8',
    );

    assert.match(promptSource, /ABSOLUTE FIX-IT AUTHORSHIP BOUNDARY/);
    assert.match(promptSource, /Ari and every other\s+Agent must never create, insert, auto-file, route, submit, delegate, or backfill a Fix-It post/);
    assert.match(promptSource, /help them\s+clarify and articulate the exact request/);
    assert.match(promptSource, /a human must create the wall post in the\s+Fix-It Feed themselves/);
    assert.doesNotMatch(promptSource, /call create_fix_it_post/);
  });
});
