import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorMessage, errorStatus, requireOwner } from '../_lib/migration-core.js';
import { processMigrationRun } from '../_lib/migration-engine.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await requireOwner(req);
    const runId = typeof req.body?.run_id === 'string' ? req.body.run_id : '';
    if (!runId) return res.status(400).json({ error: 'run_id is required' });
    await processMigrationRun(ctx.service, runId, ctx.orgId);
    const { data: run, error } = await ctx.service.from('migration_runs')
      .select('id, connection_id, source_run_id, run_type, provider, status, phase, progress, totals, error, started_at, completed_at, created_at, updated_at')
      .eq('id', runId).eq('org_id', ctx.orgId).single();
    if (error || !run) return res.status(404).json({ error: 'Migration run not found' });
    return res.status(200).json({ run });
  } catch (error) {
    return res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
}
