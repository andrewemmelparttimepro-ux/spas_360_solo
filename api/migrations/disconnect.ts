import type { VercelRequest, VercelResponse } from '@vercel/node';
import { encryptSecret, errorMessage, errorStatus, recordMigrationEvent, requireOwner, type MigrationProvider } from '../_lib/migration-core.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await requireOwner(req);
    const provider = req.body?.provider as MigrationProvider;
    if (!['hubspot', 'jobber'].includes(provider)) return res.status(400).json({ error: 'Provider must be hubspot or jobber' });
    const { data: connection } = await ctx.service.from('migration_connections').select('id')
      .eq('org_id', ctx.orgId).eq('provider', provider).maybeSingle();
    if (!connection?.id) return res.status(204).end();
    const { error } = await ctx.service.from('migration_connections').update({
      status: 'disconnected',
      credentials_ciphertext: encryptSecret({ accessToken: '', refreshToken: '', expiresAt: null }),
      token_expires_at: null,
      last_error: null,
    }).eq('id', connection.id);
    if (error) throw error;
    await recordMigrationEvent(ctx.service, { orgId: ctx.orgId, actorId: ctx.userId, connectionId: String(connection.id), type: 'provider_disconnected', detail: { provider } });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
}
