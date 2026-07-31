import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import {
  cleanReturnTo,
  encryptSecret,
  errorMessage,
  errorStatus,
  randomToken,
  requireOwner,
  sha256,
  type MigrationProvider,
} from '../_lib/migration-core.js';
import { authorizationUrl } from '../_lib/migration-providers.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const ctx = await requireOwner(req);
    const provider = req.body?.provider as MigrationProvider;
    if (!['hubspot', 'jobber'].includes(provider)) return res.status(400).json({ error: 'Provider must be hubspot or jobber' });
    const state = randomToken(32);
    const verifier = provider === 'jobber' ? randomToken(64) : null;
    const challenge = verifier ? createHash('sha256').update(verifier).digest('base64url') : null;
    const { error } = await ctx.service.from('migration_oauth_states').insert({
      state_hash: sha256(state),
      org_id: ctx.orgId,
      user_id: ctx.userId,
      provider,
      verifier_ciphertext: verifier ? encryptSecret({ verifier }) : null,
      return_to: cleanReturnTo(req.body?.return_to),
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (error) throw error;
    return res.status(200).json({ url: authorizationUrl(provider, state, challenge) });
  } catch (error) {
    return res.status(errorStatus(error)).json({ error: errorMessage(error) });
  }
}
