import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorMessage, errorStatus, requireOwner } from '../_lib/migration-core.js';
import { providerReady } from '../_lib/migration-providers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await requireOwner(req);
    const [connectionsResult, runsResult] = await Promise.all([
      ctx.service.from('migration_connections')
        .select('id, provider, status, external_account_id, external_account_name, scopes, connected_at, last_scan_at, last_error, updated_at')
        .eq('org_id', ctx.orgId)
        .order('provider'),
      ctx.service.from('migration_runs')
        .select('id, connection_id, source_run_id, run_type, provider, status, phase, progress, totals, error, started_by, started_at, completed_at, created_at, updated_at')
        .eq('org_id', ctx.orgId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);
    if (connectionsResult.error) throw connectionsResult.error;
    if (runsResult.error) throw runsResult.error;
    const connections = (connectionsResult.data ?? []).map(connection => ({
      ...connection,
      configured: providerReady(connection.provider),
    }));
    return res.status(200).json({
      providers: {
        hubspot: { configured: providerReady('hubspot') },
        jobber: { configured: providerReady('jobber') },
      },
      connections,
      runs: runsResult.data ?? [],
      server_time: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
}
