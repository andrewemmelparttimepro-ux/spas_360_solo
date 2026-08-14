#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../..');
const args = process.argv.slice(2);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (flag) => args.includes(flag);
const selectedKey = value('--source-key');
const manifestPath = resolve(value('--manifest') ?? join(repo, 'knowledge/service-sources.json'));
const cacheDir = resolve(value('--cache-dir') ?? join(repo, 'tmp/knowledge'));
const python = process.env.PYTHON_BIN || 'python3';
const dryRun = has('--dry-run');
const noUpload = has('--no-upload');
const url = (process.env.VITE_SUPABASE_URL || '').trim();
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!dryRun && (!url || !serviceKey)) {
  throw new Error('VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sources = manifest.sources.filter((source) => !selectedKey || source.source_key === selectedKey);
if (!sources.length) throw new Error(`No source matched ${selectedKey ?? 'manifest'}`);
await mkdir(cacheDir, { recursive: true });

const supabase = dryRun ? null : (await import('@supabase/supabase-js')).createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function resolveOrgId() {
  if (value('--org')) return value('--org');
  const { data, error } = await supabase.from('organizations').select('id').order('created_at').limit(2);
  if (error) throw error;
  if (data.length !== 1) throw new Error('Pass --org when the database has zero or multiple organizations');
  return data[0].id;
}

async function materialize(source) {
  if (source.path_env) {
    const path = process.env[source.path_env];
    if (!path) throw new Error(`${source.path_env} must point to the local source PDF`);
    return resolve(path);
  }
  if (!source.url) throw new Error(`${source.source_key} has no url or path_env`);
  const target = join(cacheDir, `${source.source_key}.pdf`);
  try {
    if ((await stat(target)).size > 0) return target;
  } catch {}
  const response = await fetch(source.url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`${source.source_key} download failed: HTTP ${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('pdf')) throw new Error(`${source.source_key} did not return a PDF (${contentType})`);
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
  return target;
}

async function extract(source, pdfPath) {
  const target = join(cacheDir, `${source.source_key}.chunks.json`);
  const proc = spawnSync(python, [
    join(here, 'extract_pdf.py'),
    pdfPath,
    '--title', source.title,
    '--models-json', JSON.stringify(source.models ?? []),
    '--output', target,
  ], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (proc.status !== 0) throw new Error(proc.stderr.trim() || proc.stdout.trim() || 'PDF extraction failed');
  return JSON.parse(await readFile(target, 'utf8'));
}

const orgId = dryRun ? (value('--org') ?? 'dry-run-org') : await resolveOrgId();
const results = [];
for (const source of sources) {
  const pdfPath = await materialize(source);
  const bytes = await readFile(pdfPath);
  const sourceSha = createHash('sha256').update(bytes).digest('hex');
  const chunks = await extract(source, pdfPath);
  const storagePath = `${orgId}/${source.source_key}/${sourceSha}.pdf`;
  const file = await stat(pdfPath);
  const document = {
    ...source,
    source_url: source.url ?? null,
    source_sha256: sourceSha,
    storage_bucket: noUpload ? null : 'ari-knowledge-sources',
    storage_path: noUpload ? null : storagePath,
    mime_type: 'application/pdf',
    file_size_bytes: file.size,
    status: 'active',
    verified_at: new Date().toISOString(),
    review_due_at: source.review_due_at ?? new Date(Date.now() + 366 * 86400000).toISOString().slice(0, 10),
  };
  delete document.url;
  delete document.path_env;
  delete document.models;
  delete document.part_applications;

  if (dryRun) {
    results.push({ source_key: source.source_key, sha256: sourceSha, chunks: chunks.length, bytes: file.size });
    continue;
  }

  if (!noUpload) {
    const { error: uploadError } = await supabase.storage
      .from('ari-knowledge-sources')
      .upload(storagePath, bytes, { contentType: 'application/pdf', upsert: false });
    if (uploadError && !/already exists|duplicate/i.test(uploadError.message)) throw uploadError;
  }

  const { data, error } = await supabase.rpc('ingest_knowledge_document', {
    p_org: orgId,
    p_document: document,
    p_chunks: chunks,
  });
  if (error) throw error;
  if (source.part_applications?.length) {
    const rows = source.part_applications.map((application) => ({
      ...application,
      org_id: orgId,
      source_document_id: data.document_id,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));
    const { error: applicationError } = await supabase
      .from('knowledge_part_applications')
      .upsert(rows, {
        onConflict: 'org_id,manufacturer,model,model_year_start,model_year_end,component,part_number,source_document_id',
      });
    if (applicationError) throw applicationError;
  }
  results.push({ source_key: source.source_key, ...data });
}

console.log(JSON.stringify({ sources: results.length, results }, null, 2));
