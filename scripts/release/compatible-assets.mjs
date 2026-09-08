import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';

// Run --capture <immutable deployment URL> before a release; commit the manifest.
// Builds fail closed if exact prior asset bytes cannot be restored.
const manifestPath = new URL('../../docs/remediation/compatible-assets.json', import.meta.url);
const root = new URL('../../public/assets/', import.meta.url);
const archivePath = new URL('./compatible-assets.json.gz', import.meta.url);
const digest = data => createHash('sha256').update(data).digest('hex');
let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; manifest = { assets: {} }; }

function references(text) {
  return [...text.matchAll(/["'`](?:\.\/|\/)?(?:assets\/)?([\w.-]+-[\w-]{8}\.(?:js|css|woff2?|png|svg|webp))["'`]/g)].map(m => m[1]);
}
async function download(url, name) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  const type = response.headers.get('content-type') || '';
  if (!response.ok || /text\/html/i.test(type) || (name.endsWith('.js') && !/(javascript|ecmascript)/i.test(type))) {
    throw new Error(`Invalid compatible asset: ${response.status} ${type} ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

await mkdir(root, { recursive: true });
if (process.argv[2] === '--capture') {
  const origin = new URL(process.argv[3]);
  if (origin.protocol !== 'https:' || !/^spas360solo-[\w-]+\.vercel\.app$/.test(origin.hostname)) throw new Error('Use the verified immutable SPAS deployment URL');
  const fetchOrigin = process.argv[4] === '--via-production' ? new URL('https://spas360solo.vercel.app') : origin;
  const response = await fetch(fetchOrigin, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Deployment unavailable: ${response.status}`);
  const initialHtml = await response.text();
  const queue = references(initialHtml);
  const seen = new Set();
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const url = new URL(`/assets/${name}`, origin).href;
    const bytes = await download(new URL(`/assets/${name}`, fetchOrigin).href, name);
    const sha256 = digest(bytes);
    if (manifest.assets[name] && manifest.assets[name].sha256 !== sha256) throw new Error(`Immutable filename changed: ${name}`);
    manifest.assets[name] = { url, sha256, bytes: bytes.length };
    await writeFile(new URL(name, root), bytes);
    if (/\.(js|css)$/.test(name)) queue.push(...references(bytes.toString()));
  }
  if (!seen.size) throw new Error('No assets discovered; do not release');
  const finalHtml = await (await fetch(fetchOrigin, { cache: 'no-store' })).text();
  if (references(initialHtml).join() !== references(finalHtml).join()) throw new Error('Production changed during capture');
  const archive = {};
  for (const name of Object.keys(manifest.assets)) archive[name] = (await readFile(new URL(name, root))).toString('base64');
  await writeFile(archivePath, gzipSync(JSON.stringify(archive), { level: 9 }));
  manifest.capturedAt = new Date().toISOString();
  manifest.previousDeployment = origin.href;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Retained ${seen.size} exact assets; manifest total ${Object.keys(manifest.assets).length}`);
} else {
  if (!Object.keys(manifest.assets).length) throw new Error('Compatible asset manifest required');
  const archive = JSON.parse(gunzipSync(await readFile(archivePath)).toString());
  const entries = Object.entries(manifest.assets);
  for (let offset = 0; offset < entries.length; offset += 8) {
    await Promise.all(entries.slice(offset, offset + 8).map(async ([name, asset]) => {
      if (path.basename(name) !== name) throw new Error('Invalid asset path');
      let bytes;
      try { bytes = await readFile(new URL(name, root)); } catch { /* restore below */ }
      if (!bytes || digest(bytes) !== asset.sha256) bytes = Buffer.from(archive[name] || '', 'base64');
      if (digest(bytes) !== asset.sha256) throw new Error(`Asset checksum mismatch: ${name}`);
      await writeFile(new URL(name, root), bytes);
    }));
  }
  console.log(`Verified ${entries.length} compatible assets`);
}
