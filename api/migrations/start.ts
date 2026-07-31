import type { VercelRequest, VercelResponse } from '@vercel/node';
import { errorMessage, errorStatus, recordMigrationEvent, requireOwner, type MigrationProvider } from '../_lib/migration-core.js';

type StartAction = 'scan' | 'import' | 'rollback';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await requireOwner(req);
    const action = req.body?.action as StartAction;
    const provider = req.body?.provider as MigrationProvider;
    if (!['scan', 'import', 'rollback'].includes(action)) return res.status(400).json({ error: 'Unknown migration action' });
    if (!['hubspot', 'jobber'].includes(provider)) return res.status(400).json({ error: 'Provider must be hubspot or jobber' });

    const { data: active } = await ctx.service.from('migration_runs').select('id')
      .eq('org_id', ctx.orgId).eq('provider', provider).in('status', ['queued', 'running']).limit(1).maybeSingle();
    if (active?.id) return res.status(409).json({ error: 'This provider already has a migration running', run_id: active.id });

    const { data: connection } = await ctx.service.from('migration_connections').select('id, status')
      .eq('org_id', ctx.orgId).eq('provider', provider).maybeSingle();
    if (action !== 'rollback' && (!connection || connection.status !== 'connected')) {
      return res.status(409).json({ error: `Connect ${provider === 'hubspot' ? 'HubSpot' : 'Jobber'} before starting` });
    }

    let sourceRunId: string | null = typeof req.body?.source_run_id === 'string' ? req.body.source_run_id : null;
    if (action === 'import') {
      const { data: source } = await ctx.service.from('migration_runs').select('id, provider, status, run_type')
        .eq('id', sourceRunId).eq('org_id', ctx.orgId).eq('provider', provider).eq('run_type', 'scan').maybeSingle();
      if (!source || source.status !== 'awaiting_review') return res.status(409).json({ error: 'Choose a completed scan preview before importing' });
    }
    if (action === 'rollback') {
      const { data: source } = await ctx.service.from('migration_runs').select('id, provider, status, run_type, connection_id')
        .eq('id', sourceRunId).eq('org_id', ctx.orgId).eq('provider', provider).eq('run_type', 'import').maybeSingle();
      if (!source || source.status !== 'completed') return res.status(409).json({ error: 'Only a completed import can be rolled back' });
    }

    const { data: run, error } = await ctx.service.from('migration_runs').insert({
      org_id: ctx.orgId,
      connection_id: connection?.id ?? null,
      source_run_id: action === 'scan' ? null : sourceRunId,
      run_type: action,
      provider,
      status: 'queued',
      phase: 'queued',
      progress: 0,
      cursor: action === 'scan' ? { objectIndex: 0, pageCursor: null } : {},
      totals: {},
      started_by: ctx.userId,
    }).select('*').single();
    if (error || !run?.id) throw error || new Error('Could not create migration run');
    await recordMigrationEvent(ctx.service, {
      orgId: ctx.orgId,
      actorId: ctx.userId,
      runId: String(run.id),
      connectionId: connection?.id ?? null,
      type: `${action}_started`,
      detail: { provider, source_run_id: sourceRunId },
    });
    return res.status(201).json({ run });
  } catch (error) {
    return res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
}
