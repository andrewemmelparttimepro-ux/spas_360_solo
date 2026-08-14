import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { scrubTelemetryValue } from '../src/lib/telemetryPrivacy.ts';

const repoFile = (path: string) => new URL(`../${path}`, import.meta.url);

describe('Ari service knowledge corpus', () => {
  it('keeps a unique, governed source manifest with the supplied catalog private', async () => {
    const manifest = JSON.parse(await readFile(repoFile('knowledge/service-sources.json'), 'utf8'));
    assert.equal(manifest.sources.length, 13);
    assert.equal(new Set(manifest.sources.map((source: { source_key: string }) => source.source_key)).size, 13);

    const supplied = manifest.sources.find(
      (source: { source_key: string }) => source.source_key === 'sundance-parts-pre-2015-volume-1-rev-m',
    );
    assert.ok(supplied);
    assert.equal(supplied.path_env, 'SUNDANCE_PARTS_2015_VOL1_PATH');
    assert.equal(supplied.access_scope, 'staff');
    assert.match(supplied.confidentiality_note, /confidential dealer\/service literature/);

    assert.deepEqual(supplied.part_applications, [{
      manufacturer: 'Sundance Spas',
      model: 'Optima',
      model_year_start: 2009,
      model_year_end: 2018,
      component: 'Pillow, packaged',
      part_number: '6472-964',
      quantity: 4,
      variant: '880 Series, 2009–2018 pillow style',
      page_start: 141,
      page_end: 141,
      verification_note: 'Manufacturer matrix lists Optima 2009–01/22/2019 under the 880 Series 2009–2018 packaged pillow column. Visually verified against page 141.',
    }]);
  });

  it('keeps private source files in a non-public bucket and exposes structured part lookup', async () => {
    const migration = await readFile(
      repoFile('supabase/migrations/20260814193000_ari_service_knowledge_and_inbox_read_tracking.sql'),
      'utf8',
    );
    assert.match(migration, /values \('ari-knowledge-sources', 'ari-knowledge-sources', false/);
    assert.match(migration, /create table if not exists public\.knowledge_part_applications/);
    assert.match(migration, /p_access_scope = 'staff' or d\.access_scope = 'public'/);

    const tools = await readFile(repoFile('src/agent/toolFactory.ts'), 'utf8');
    assert.match(tools, /name: 'lookup_service_parts'/);
    assert.match(tools, /\.from\('knowledge_part_applications'\)/);
  });
});

describe('client telemetry privacy', () => {
  it('scrubs credentials and contact details before transmission', () => {
    const raw = 'Bearer abc.DEF_123 token=secret person@example.com +1 (701) 555-1212';
    const scrubbed = scrubTelemetryValue(raw, 500);
    assert.equal(scrubbed.includes('abc.DEF_123'), false);
    assert.equal(scrubbed.includes('secret'), false);
    assert.equal(scrubbed.includes('person@example.com'), false);
    assert.equal(scrubbed.includes('701'), false);
    assert.match(scrubbed, /Bearer \[redacted\]/);
    assert.match(scrubbed, /token=\[redacted\]/);
    assert.match(scrubbed, /\[email\]/);
    assert.match(scrubbed, /\[phone\]/);
  });

  it('enforces the output bound after scrubbing', () => {
    assert.equal(scrubTelemetryValue('x'.repeat(200), 80).length, 80);
  });
});

describe('Ari answer rendering', () => {
  it('renders assistant Markdown structurally instead of exposing table syntax', async () => {
    const chat = await readFile(repoFile('src/components/ChatWidget.tsx'), 'utf8');
    const renderer = await readFile(repoFile('src/components/MarkdownMessage.tsx'), 'utf8');
    assert.match(chat, /<MarkdownMessage body=\{msg\.content\} \/>/);
    assert.match(renderer, /<table className=/);
    assert.match(renderer, /<strong key=/);
    assert.doesNotMatch(renderer, /dangerouslySetInnerHTML/);
  });
});
