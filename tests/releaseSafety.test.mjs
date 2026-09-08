import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';

async function worker({ cached, fetched, offline = false } = {}) {
  const handlers = {}; const puts = []; const deletions = [];
  const cache = { match: async () => cached, put: async (...args) => puts.push(args), delete: async key => deletions.push(key) };
  const context = {
    URL, Response,
    self: { location: { origin: 'https://spas.test' }, addEventListener: (name, fn) => handlers[name] = fn, skipWaiting() {}, clients: { claim: async () => {} } },
    caches: { match: async () => cached, open: async () => cache, keys: async () => ['spas360-v1'] },
    fetch: async () => { if (offline) throw new Error('offline'); return fetched; },
  };
  vm.runInNewContext(await readFile(new URL('../public/sw.js', import.meta.url), 'utf8'), context);
  return { handlers, puts, deletions, async get(path, mode = 'cors') {
    let result;
    handlers.fetch({ request: { url: `https://spas.test${path}`, method: 'GET', mode }, respondWith: promise => { result = promise; } });
    return result;
  } };
}

test('old deployment asset archive contains the exact checksum-verified bytes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../docs/remediation/compatible-assets.json', import.meta.url)));
  const archive = JSON.parse(gunzipSync(await readFile(new URL('../scripts/release/compatible-assets.json.gz', import.meta.url))));
  assert.ok(Object.keys(manifest.assets).length > 40);
  for (const [name, entry] of Object.entries(manifest.assets)) {
    const bytes = Buffer.from(archive[name], 'base64');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), entry.sha256, name);
    assert.equal(bytes.length, entry.bytes);
  }
});
test('HTML cached under a chunk URL is evicted and replaced with valid JavaScript', async () => {
  const w = await worker({ cached: new Response('<html>bad</html>', { headers: { 'content-type': 'text/html' } }), fetched: new Response('export const ok = true', { headers: { 'content-type': 'application/javascript' } }) });
  assert.match(await (await w.get('/assets/old-12345678.js')).text(), /export const/);
  assert.equal(w.deletions.length, 1); assert.equal(w.puts.length, 1);
});
test('HTML and unsuccessful asset responses never enter cache', async () => {
  for (const response of [new Response('<html/>', { headers: { 'content-type': 'text/html' } }), new Response('error', { status: 503 })]) {
    const w = await worker({ fetched: response }); await w.get('/assets/old-12345678.js'); assert.equal(w.puts.length, 0);
  }
});
test('cached valid old chunks remain usable offline', async () => {
  const w = await worker({ cached: new Response('old code', { headers: { 'content-type': 'text/javascript' } }), offline: true });
  assert.equal(await (await w.get('/assets/old-12345678.js')).text(), 'old code'); assert.equal(w.deletions.length, 0);
});
test('offline navigation has a bounded explicit fallback; API writes bypass the worker', async () => {
  const w = await worker({ offline: true });
  assert.equal((await w.get('/deals', 'navigate')).status, 503);
  assert.equal(await w.get('/api/agent/run'), undefined);
});
