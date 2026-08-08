import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorMessage, errorStatus, requireOwner } from '../_lib/migration-core.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await requireOwner(req);
    const runId = typeof req.query.run_id === 'string' ? req.query.run_id : '';
    if (!runId) return res.status(400).json({ error: 'run_id is required' });
    const { data: run, error: runError } = await ctx.service.from('migration_runs')
      .select('id, provider, run_type, status, phase, progress, totals, error, created_at, completed_at')
      .eq('id', runId).eq('org_id', ctx.orgId).single();
    if (runError || !run) return res.status(404).json({ error: 'Migration run not found' });
    const { data: records, error: recordsError } = await ctx.service.from('migration_source_records')
      .select('object_type, disposition, issues')
      .eq('run_id', runId).eq('org_id', ctx.orgId);
    if (recordsError) throw recordsError;
    const objects: Record<string, Record<string, number>> = {};
    const issues: string[] = [];
    for (const record of records ?? []) {
      objects[record.object_type] ||= {};
      objects[record.object_type][record.disposition] = (objects[record.object_type][record.disposition] || 0) + 1;
      if (Array.isArray(record.issues)) for (const issue of record.issues) if (typeof issue === 'string' && issues.length < 100) issues.push(issue);
    }
    return res.status(200).json({ run, objects, issues, record_count: records?.length ?? 0 });
  } catch (error) {
    return res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
}
