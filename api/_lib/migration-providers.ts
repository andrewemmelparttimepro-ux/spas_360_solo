import type { SupabaseClient } from '@supabase/supabase-js';
import {
  assertProviderConfigured,
  decryptSecret,
  encryptSecret,
  fetchJson,
  providerConfiguration,
  type MigrationProvider,
  type ProviderCredentials,
} from './migration-core.js';

export type ProviderConnection = {
  id: string;
  org_id: string;
  provider: MigrationProvider;
  credentials_ciphertext: string;
  token_expires_at: string | null;
};

export type SourceRecordInput = {
  objectType: string;
  sourceId: string;
  sourceUpdatedAt?: string | null;
  raw: Record<string, unknown>;
  normalized?: Record<string, unknown>;
  issues?: string[];
  disposition?: 'staged' | 'ready' | 'needs_review' | 'preserved';
};

export type ProviderPage = {
  records: SourceRecordInput[];
  nextCursor: string | null;
  hasNext: boolean;
};

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scopes?: string[];
  hub_id?: number;
};

const HUBSPOT_OBJECTS = [
  { type: 'contacts', properties: ['firstname', 'lastname', 'email', 'phone', 'mobilephone', 'address', 'city', 'state', 'zip', 'country', 'lifecyclestage', 'hs_lead_status', 'hubspot_owner_id', 'createdate', 'lastmodifieddate'], associations: ['companies', 'deals', 'tickets'] },
  { type: 'companies', properties: ['name', 'domain', 'phone', 'address', 'city', 'state', 'zip', 'country', 'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate'], associations: ['contacts', 'deals', 'tickets'] },
  { type: 'deals', properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'closedate', 'hubspot_owner_id', 'hs_priority', 'createdate', 'hs_lastmodifieddate'], associations: ['contacts', 'companies', 'quotes', 'line_items'] },
  { type: 'tickets', properties: ['subject', 'content', 'hs_pipeline', 'hs_pipeline_stage', 'hs_ticket_priority', 'hubspot_owner_id', 'createdate', 'hs_lastmodifieddate'], associations: ['contacts', 'companies', 'deals'] },
  { type: 'tasks', properties: ['hs_task_subject', 'hs_task_body', 'hs_task_status', 'hs_task_priority', 'hs_timestamp', 'hubspot_owner_id', 'hs_createdate', 'hs_lastmodifieddate'], associations: ['contacts', 'companies', 'deals', 'tickets'] },
  { type: 'notes', properties: ['hs_note_body', 'hs_attachment_ids', 'hs_timestamp', 'hubspot_owner_id', 'hs_createdate', 'hs_lastmodifieddate'], associations: ['contacts', 'companies', 'deals', 'tickets'] },
  { type: 'calls', properties: ['hs_call_title', 'hs_call_body', 'hs_call_status', 'hs_call_duration', 'hs_call_from_number', 'hs_call_to_number', 'hs_timestamp', 'hubspot_owner_id', 'hs_createdate'], associations: ['contacts', 'companies', 'deals', 'tickets'] },
  { type: 'emails', properties: ['hs_email_subject', 'hs_email_text', 'hs_email_html', 'hs_email_direction', 'hs_email_status', 'hs_timestamp', 'hubspot_owner_id', 'hs_createdate'], associations: ['contacts', 'companies', 'deals', 'tickets'] },
  { type: 'meetings', properties: ['hs_meeting_title', 'hs_meeting_body', 'hs_meeting_start_time', 'hs_meeting_end_time', 'hs_meeting_outcome', 'hs_timestamp', 'hubspot_owner_id', 'hs_createdate'], associations: ['contacts', 'companies', 'deals', 'tickets'] },
  { type: 'quotes', properties: ['hs_title', 'hs_status', 'hs_expiration_date', 'hs_public_url_key', 'hs_createdate', 'hs_lastmodifieddate'], associations: ['contacts', 'companies', 'deals', 'line_items'] },
  { type: 'line_items', properties: ['name', 'description', 'quantity', 'price', 'amount', 'discount', 'hs_sku', 'createdate', 'hs_lastmodifieddate'], associations: ['deals', 'quotes', 'products'] },
  { type: 'products', properties: ['name', 'description', 'price', 'hs_sku', 'hs_cost_of_goods_sold', 'createdate', 'hs_lastmodifieddate'], associations: [] },
] as const;

export const HUBSPOT_OBJECT_TYPES = HUBSPOT_OBJECTS.map(item => item.type);

const JOBBER_COLLECTIONS = [
  {
    type: 'clients',
    root: 'clients',
    selection: `id firstName lastName name email phone isCompany isLead isArchived createdAt updatedAt jobberWebUri billingAddress { street1 street2 city province postalCode country }`,
  },
  {
    type: 'jobs',
    root: 'jobs',
    selection: `id jobNumber title jobStatus jobType instructions startAt endAt total uninvoicedTotal createdAt updatedAt jobberWebUri client { id } property { id } salesperson { id }`,
  },
  {
    type: 'requests',
    root: 'requests',
    selection: `id title requestStatus source contactName companyName email phone createdAt updatedAt jobberWebUri client { id } property { id } salesperson { id }`,
  },
  {
    type: 'quotes',
    root: 'quotes',
    selection: `id quoteNumber title quoteStatus message createdAt updatedAt transitionedAt sentAt jobberWebUri client { id } property { id } salesperson { id }`,
  },
  {
    type: 'invoices',
    root: 'invoices',
    selection: `id invoiceNumber subject invoiceStatus issuedDate dueDate createdAt updatedAt jobberWebUri client { id }`,
  },
] as const;

export const JOBBER_OBJECT_TYPES = JOBBER_COLLECTIONS.map(item => item.type);

function expiresAt(seconds?: number): string | null {
  return seconds ? new Date(Date.now() + Math.max(0, seconds - 30) * 1000).toISOString() : null;
}

export async function exchangeAuthorizationCode(provider: MigrationProvider, code: string, verifier?: string | null) {
  const config = assertProviderConfigured(provider);
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri,
  });
  if (provider === 'jobber' && verifier) body.set('code_verifier', verifier);
  const endpoint = provider === 'hubspot'
    ? 'https://api.hubspot.com/oauth/2026-03/token'
    : 'https://api.getjobber.com/api/oauth/token';
  const token = await fetchJson<TokenResponse>(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!token.access_token || !token.refresh_token) throw new Error(`${provider} did not return reusable OAuth credentials`);
  const credentials: ProviderCredentials = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    tokenType: token.token_type,
    expiresAt: expiresAt(token.expires_in),
    scopes: token.scopes ?? (provider === 'hubspot' ? config.scopes : []),
  };

  if (provider === 'hubspot') {
    return {
      credentials,
      accountId: token.hub_id ? String(token.hub_id) : 'hubspot',
      accountName: token.hub_id ? `HubSpot account ${token.hub_id}` : 'HubSpot',
      scopes: credentials.scopes ?? [],
    };
  }

  const account = await jobberGraphql<{ account: { id: string; name: string } }>(credentials.accessToken, `query MigrationAccount { account { id name } }`);
  return {
    credentials,
    accountId: account.account.id,
    accountName: account.account.name,
    scopes: [] as string[],
  };
}

async function refreshCredentials(provider: MigrationProvider, credentials: ProviderCredentials): Promise<ProviderCredentials> {
  const config = assertProviderConfigured(provider);
  const endpoint = provider === 'hubspot'
    ? 'https://api.hubspot.com/oauth/2026-03/token'
    : 'https://api.getjobber.com/api/oauth/token';
  const token = await fetchJson<TokenResponse>(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }),
  });
  if (!token.access_token) throw new Error(`${provider} token refresh returned no access token`);
  return {
    accessToken: token.access_token,
    refreshToken: token.refresh_token || credentials.refreshToken,
    tokenType: token.token_type || credentials.tokenType,
    expiresAt: expiresAt(token.expires_in),
    scopes: token.scopes || credentials.scopes,
  };
}

export async function accessTokenFor(service: SupabaseClient, connection: ProviderConnection): Promise<string> {
  let credentials = decryptSecret<ProviderCredentials>(connection.credentials_ciphertext);
  const expiry = credentials.expiresAt ? new Date(credentials.expiresAt).getTime() : 0;
  if (expiry && expiry > Date.now() + 120_000) return credentials.accessToken;
  try {
    credentials = await refreshCredentials(connection.provider, credentials);
    const { error } = await service.from('migration_connections').update({
      credentials_ciphertext: encryptSecret(credentials),
      token_expires_at: credentials.expiresAt,
      status: 'connected',
      last_error: null,
    }).eq('id', connection.id);
    if (error) throw error;
    return credentials.accessToken;
  } catch (error) {
    await service.from('migration_connections').update({ status: 'needs_reauth', last_error: error instanceof Error ? error.message : 'Token refresh failed' }).eq('id', connection.id);
    throw error;
  }
}

function hubSpotNormalize(objectType: string, raw: Record<string, unknown>): Record<string, unknown> {
  const properties = (raw.properties || {}) as Record<string, unknown>;
  const associations = (raw.associations || {}) as Record<string, { results?: { id?: string }[] }>;
  const associationIds = Object.fromEntries(Object.entries(associations).map(([key, value]) => [key, (value?.results || []).map(item => String(item.id || '')).filter(Boolean)]));
  return { ...properties, associations: associationIds };
}

export async function scanHubSpotPage(accessToken: string, objectIndex: number, cursor: string | null): Promise<ProviderPage> {
  const definition = HUBSPOT_OBJECTS[objectIndex];
  if (!definition) return { records: [], nextCursor: null, hasNext: false };
  const params = new URLSearchParams({ limit: '100', archived: 'false' });
  if (definition.properties.length) params.set('properties', definition.properties.join(','));
  if (definition.associations.length) params.set('associations', definition.associations.join(','));
  if (cursor) params.set('after', cursor);
  try {
    const data = await fetchJson<{
      results?: Array<Record<string, unknown> & { id: string; updatedAt?: string; properties?: Record<string, unknown> }>;
      paging?: { next?: { after?: string } };
    }>(`https://api.hubapi.com/crm/v3/objects/${definition.type}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const nextCursor = data.paging?.next?.after ?? null;
    return {
      records: (data.results ?? []).map(raw => ({
        objectType: definition.type,
        sourceId: String(raw.id),
        sourceUpdatedAt: raw.updatedAt ?? (String(raw.properties?.hs_lastmodifieddate || raw.properties?.lastmodifieddate || '') || null),
        raw,
        normalized: hubSpotNormalize(definition.type, raw),
        disposition: ['contacts', 'deals', 'tasks', 'notes', 'calls', 'emails', 'meetings'].includes(definition.type) ? 'ready' : 'preserved',
      })),
      nextCursor,
      hasNext: Boolean(nextCursor),
    };
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 403 || status === 404) {
      return {
        records: [{
          objectType: 'provider_warning',
          sourceId: `hubspot:${definition.type}`,
          raw: { objectType: definition.type, error: error instanceof Error ? error.message : String(error) },
          normalized: { objectType: definition.type },
          issues: [`HubSpot did not grant access to ${definition.type}. Reconnect with the required scope if this data is needed.`],
          disposition: 'needs_review',
        }],
        nextCursor: null,
        hasNext: false,
      };
    }
    throw error;
  }
}

async function jobberGraphql<T>(accessToken: string, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const data = await fetchJson<{ data?: T; errors?: { message?: string }[] }>('https://api.getjobber.com/api/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'X-JOBBER-GRAPHQL-VERSION': (process.env.JOBBER_GRAPHQL_VERSION || '2025-04-16').trim(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  if (data.errors?.length) throw Object.assign(new Error(data.errors.map(item => item.message || 'Jobber query failed').join('; ')), { statusCode: 422 });
  if (!data.data) throw new Error('Jobber returned no data');
  return data.data;
}

export async function scanJobberPage(accessToken: string, objectIndex: number, cursor: string | null): Promise<ProviderPage> {
  const definition = JOBBER_COLLECTIONS[objectIndex];
  if (!definition) return { records: [], nextCursor: null, hasNext: false };
  const query = `query MigrationPage($cursor: String) {
    ${definition.root}(first: 50, after: $cursor) {
      nodes { ${definition.selection} }
      pageInfo { hasNextPage endCursor }
      totalCount
    }
  }`;
  try {
    const result = await jobberGraphql<Record<string, { nodes?: Record<string, unknown>[]; pageInfo?: { hasNextPage?: boolean; endCursor?: string | null } }>>(accessToken, query, { cursor });
    const connection = result[definition.root] || {};
    const nextCursor = connection.pageInfo?.endCursor ?? null;
    return {
      records: (connection.nodes ?? []).map(raw => ({
        objectType: definition.type,
        sourceId: String(raw.id),
        sourceUpdatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
        raw,
        normalized: raw,
        disposition: ['clients', 'jobs'].includes(definition.type) ? 'ready' : 'preserved',
      })),
      nextCursor,
      hasNext: Boolean(connection.pageInfo?.hasNextPage && nextCursor),
    };
  } catch (error) {
    return {
      records: [{
        objectType: 'provider_warning',
        sourceId: `jobber:${definition.type}`,
        raw: { objectType: definition.type, error: error instanceof Error ? error.message : String(error) },
        normalized: { objectType: definition.type },
        issues: [`Jobber did not return ${definition.type}. Review this app's scopes or API schema before cutover.`],
        disposition: 'needs_review',
      }],
      nextCursor: null,
      hasNext: false,
    };
  }
}

export function providerObjectTypes(provider: MigrationProvider): string[] {
  return provider === 'hubspot' ? [...HUBSPOT_OBJECT_TYPES] : [...JOBBER_OBJECT_TYPES];
}

export function authorizationUrl(provider: MigrationProvider, state: string, challenge?: string | null): string {
  const config = assertProviderConfigured(provider);
  if (provider === 'hubspot') {
    const params = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, scope: config.scopes.join(' '), state });
    return `https://app.hubspot.com/oauth/authorize?${params}`;
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    state,
  });
  if (challenge) {
    params.set('code_challenge', challenge);
    params.set('code_challenge_method', 'S256');
  }
  return `https://api.getjobber.com/api/oauth/authorize?${params}`;
}

export function providerReady(provider: MigrationProvider): boolean {
  const config = providerConfiguration(provider);
  return Boolean(config.clientId && config.clientSecret && process.env.MIGRATION_ENCRYPTION_KEY);
}
