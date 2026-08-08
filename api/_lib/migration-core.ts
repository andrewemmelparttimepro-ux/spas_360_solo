import type { VercelRequest } from '@vercel/node';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type MigrationProvider = 'hubspot' | 'jobber';

export type ProviderCredentials = {
  accessToken: string;
  refreshToken: string;
  tokenType?: string;
  expiresAt: string | null;
  scopes?: string[];
};

export type OwnerContext = {
  token: string;
  userId: string;
  orgId: string;
  service: SupabaseClient;
  userClient: SupabaseClient;
};

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

export const MIGRATION_APP_URL = (process.env.MIGRATION_APP_URL || 'https://spas360solo.vercel.app').replace(/\/$/, '');

export function bearer(req: VercelRequest): string | null {
  const raw = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function serviceClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_SERVICE) throw new Error('Migration service is not configured');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function clientFor(token: string): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON) throw new Error('SPAS 360 authentication is not configured');
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

export async function requireOwner(req: VercelRequest): Promise<OwnerContext> {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error('Missing authorization'), { statusCode: 401 });
  const userClient = clientFor(token);
  const { data: auth, error: authError } = await userClient.auth.getUser(token);
  const userId = auth.user?.id;
  if (authError || !userId) throw Object.assign(new Error('Invalid or expired session'), { statusCode: 401 });
  const { data: profile, error: profileError } = await userClient
    .from('profiles')
    .select('id, org_id, role')
    .eq('id', userId)
    .single();
  if (profileError || !profile?.org_id) throw Object.assign(new Error('No SPAS 360 profile is attached to this login'), { statusCode: 403 });
  if (profile.role !== 'owner_manager') throw Object.assign(new Error('Only an owner / manager can migrate company data'), { statusCode: 403 });
  return { token, userId, orgId: profile.org_id as string, service: serviceClient(), userClient };
}

function encryptionKey(): Buffer {
  const value = (process.env.MIGRATION_ENCRYPTION_KEY || '').trim();
  if (!value) throw new Error('Migration credential encryption is not configured');
  const key = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, 'hex') : Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('MIGRATION_ENCRYPTION_KEY must decode to exactly 32 bytes');
  return key;
}

export function encryptSecret(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptSecret<T>(value: string): T {
  const [version, ivRaw, tagRaw, dataRaw] = value.split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !dataRaw) throw new Error('Stored migration credential is invalid');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataRaw, 'base64url')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

export function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function providerConfiguration(provider: MigrationProvider) {
  if (provider === 'hubspot') {
    return {
      clientId: (process.env.HUBSPOT_CLIENT_ID || '').trim(),
      clientSecret: (process.env.HUBSPOT_CLIENT_SECRET || '').trim(),
      redirectUri: `${MIGRATION_APP_URL}/api/migrations/callback-hubspot`,
      scopes: (process.env.HUBSPOT_SCOPES || 'oauth crm.objects.contacts.read crm.objects.companies.read crm.objects.deals.read')
        .split(/[\s,]+/).filter(Boolean),
    };
  }
  return {
    clientId: (process.env.JOBBER_CLIENT_ID || '').trim(),
    clientSecret: (process.env.JOBBER_CLIENT_SECRET || '').trim(),
    redirectUri: `${MIGRATION_APP_URL}/api/migrations/callback-jobber`,
    scopes: [] as string[],
  };
}

export function assertProviderConfigured(provider: MigrationProvider) {
  const config = providerConfiguration(provider);
  if (!config.clientId || !config.clientSecret) {
    throw Object.assign(new Error(`${provider === 'hubspot' ? 'HubSpot' : 'Jobber'} connection is not configured yet`), { statusCode: 503 });
  }
  encryptionKey();
  return config;
}

export async function recordMigrationEvent(
  service: SupabaseClient,
  input: { orgId: string; actorId?: string | null; runId?: string | null; connectionId?: string | null; type: string; detail?: Record<string, unknown> },
) {
  const { error } = await service.from('migration_events').insert({
    org_id: input.orgId,
    actor_id: input.actorId ?? null,
    run_id: input.runId ?? null,
    connection_id: input.connectionId ?? null,
    event_type: input.type,
    detail: input.detail ?? {},
  });
  if (error) throw new Error(`Could not write migration audit event: ${error.message}`);
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, timeoutMs = 25_000): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  const raw = await response.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const message = typeof data === 'object' && data && 'message' in data
      ? String((data as { message?: unknown }).message)
      : typeof data === 'object' && data && 'error' in data
        ? String((data as { error?: unknown }).error)
        : String(data || `HTTP ${response.status}`);
    throw Object.assign(new Error(message.slice(0, 1000)), { statusCode: response.status, responseBody: data });
  }
  return data as T;
}

export function cleanReturnTo(value: unknown): string {
  const path = typeof value === 'string' ? value : '/settings';
  return path.startsWith('/') && !path.startsWith('//') ? path.slice(0, 300) : '/settings';
}

export function errorStatus(error: unknown): number {
  const value = error as { statusCode?: unknown };
  return typeof value?.statusCode === 'number' && value.statusCode >= 400 && value.statusCode < 600 ? value.statusCode : 500;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected migration error';
}
