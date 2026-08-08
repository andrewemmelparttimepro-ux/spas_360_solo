import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

process.env.MIGRATION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

test('migration credentials round-trip through authenticated encryption', async () => {
  const { encryptSecret, decryptSecret } = await import('../api/_lib/migration-core.ts');
  const source = { accessToken: 'access-secret', refreshToken: 'refresh-secret', expiresAt: '2026-08-01T00:00:00.000Z' };
  const encrypted = encryptSecret(source);
  assert.match(encrypted, /^v1\./);
  assert.equal(encrypted.includes(source.accessToken), false);
  assert.deepEqual(decryptSecret(encrypted), source);
});

test('migration credential tampering is rejected', async () => {
  const { encryptSecret, decryptSecret } = await import('../api/_lib/migration-core.ts');
  const encrypted = encryptSecret({ accessToken: 'sensitive' });
  const tampered = `${encrypted.slice(0, -1)}${encrypted.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(() => decryptSecret(tampered));
});

test('migration schema is browser-denied, RLS-enabled, and idempotent by source id', () => {
  const sql = readFileSync(new URL('../supabase/migrations/20260731151038_migration_center.sql', import.meta.url), 'utf8');
  const tables = [
    'migration_connections', 'migration_oauth_states', 'migration_runs',
    'migration_source_records', 'migration_external_links', 'migration_changes', 'migration_events',
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
    assert.match(sql, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`, 'i'));
  }
  assert.match(sql, /unique \(run_id, object_type, source_id\)/i);
  assert.match(sql, /unique \(org_id, provider, object_type, source_id\)/i);
});

test('provider callbacks and browser UI never receive stored credential fields', () => {
  const status = readFileSync(new URL('../api/migrations/status.ts', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/components/MigrationCenter.tsx', import.meta.url), 'utf8');
  assert.equal(/credentials_ciphertext/.test(status), false);
  assert.equal(/refreshToken|accessToken/.test(ui), false);
});

test('provider authorization uses current OAuth protections and endpoints', () => {
  const providers = readFileSync(new URL('../api/_lib/migration-providers.ts', import.meta.url), 'utf8');
  const authorize = readFileSync(new URL('../api/migrations/authorize.ts', import.meta.url), 'utf8');
  assert.match(providers, /https:\/\/api\.hubspot\.com\/oauth\/2026-03\/token/);
  assert.match(providers, /code_challenge_method.*S256/);
  assert.match(authorize, /state_hash:\s*sha256\(state\)/);
  assert.match(authorize, /expires_at:/);
});
