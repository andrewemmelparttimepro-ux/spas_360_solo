import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'node:crypto';
import { bearer, errorMessage, errorStatus, requireOwner, serviceClient } from '../_lib/migration-core.js';
import { accessTokenFor, type ProviderConnection } from '../_lib/migration-providers.js';
import { jobberReadQuery } from '../_lib/migration-selection.js';

// The offline migration runner uses the existing server credential. Jobber
// secrets remain in Vercel; normal app access still requires an owner session.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const supplied = Buffer.from(bearer(req) || '');
    const expected = Buffer.from((process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim());
    const isServer = expected.length > 0 && supplied.length === expected.length && timingSafeEqual(supplied, expected);
    const owner = isServer ? null : await requireOwner(req);
    const service = owner?.service || serviceClient();
    const orgId = owner?.orgId || req.body?.org_id;
    const connectionId = req.body?.connection_id;
    if (typeof orgId !== 'string' || typeof connectionId !== 'string') return res.status(400).json({ error: 'Organization and connection are required' });
    const query = jobberReadQuery(req.body?.query);
    const { data: connection, error } = await service.from('migration_connections').select('*')
      .eq('org_id', orgId).eq('id', connectionId).eq('provider', 'jobber').eq('status', 'connected').maybeSingle();
    if (error) throw error;
    if (!connection) return res.status(404).json({ error: 'Connected Jobber account not found' });
    const token = await accessTokenFor(service, connection as ProviderConnection);
    const response = await fetch('https://api.getjobber.com/api/graphql', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json',
        'X-JOBBER-GRAPHQL-VERSION': (process.env.JOBBER_GRAPHQL_VERSION || '2025-04-16').trim() },
      body: JSON.stringify({ query, variables: req.body?.variables || {} }), signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) return res.status(response.status).json({ error: `Jobber returned HTTP ${response.status}` });
    return res.status(200).json(await response.json());
  } catch (error) {
    return res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
}
