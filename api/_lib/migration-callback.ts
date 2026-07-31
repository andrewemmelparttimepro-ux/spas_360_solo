import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  MIGRATION_APP_URL,
  decryptSecret,
  encryptSecret,
  errorMessage,
  recordMigrationEvent,
  serviceClient,
  sha256,
  type MigrationProvider,
} from './migration-core.js';
import { exchangeAuthorizationCode } from './migration-providers.js';

export async function handleMigrationCallback(provider: MigrationProvider, req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const oauthError = typeof req.query.error === 'string' ? req.query.error : '';
  const service = serviceClient();
  let returnTo = '/settings';
  try {
    if (!state) throw new Error('The authorization response did not include state');
    const stateHash = sha256(state);
    const { data: stored, error } = await service.from('migration_oauth_states').select('*').eq('state_hash', stateHash).single();
    if (error || !stored) throw new Error('This authorization request is invalid or has expired');
    returnTo = typeof stored.return_to === 'string' ? stored.return_to : '/settings';
    if (stored.provider !== provider) throw new Error('The authorization provider does not match the request');
    if (stored.consumed_at) throw new Error('This authorization request has already been used');
    if (new Date(stored.expires_at).getTime() < Date.now()) throw new Error('This authorization request expired; start again from SPAS 360');
    const { data: consumed, error: consumeError } = await service.from('migration_oauth_states')
      .update({ consumed_at: new Date().toISOString() })
      .eq('state_hash', stateHash)
      .is('consumed_at', null)
      .select('state_hash')
      .maybeSingle();
    if (consumeError || !consumed) throw new Error('This authorization request has already been used');
    if (oauthError) throw new Error(`Authorization was not completed: ${oauthError}`);
    if (!code) throw new Error('The authorization response did not include a code');
    const verifier = stored.verifier_ciphertext ? decryptSecret<{ verifier: string }>(stored.verifier_ciphertext).verifier : null;
    const account = await exchangeAuthorizationCode(provider, code, verifier);
    const { data: connection, error: connectionError } = await service.from('migration_connections').upsert({
      org_id: stored.org_id,
      provider,
      status: 'connected',
      external_account_id: account.accountId,
      external_account_name: account.accountName,
      scopes: account.scopes,
      credentials_ciphertext: encryptSecret(account.credentials),
      token_expires_at: account.credentials.expiresAt,
      connected_by: stored.user_id,
      connected_at: new Date().toISOString(),
      last_error: null,
    }, { onConflict: 'org_id,provider' }).select('id').single();
    if (connectionError || !connection?.id) throw new Error(connectionError?.message || 'Could not save the provider connection');
    await recordMigrationEvent(service, {
      orgId: stored.org_id,
      actorId: stored.user_id,
      connectionId: String(connection.id),
      type: 'provider_connected',
      detail: { provider, account_id: account.accountId, account_name: account.accountName },
    });
    const destination = new URL(returnTo, MIGRATION_APP_URL);
    destination.searchParams.set('migration', 'connected');
    destination.searchParams.set('provider', provider);
    return res.redirect(302, destination.toString());
  } catch (error) {
    const destination = new URL(returnTo, MIGRATION_APP_URL);
    destination.searchParams.set('migration', 'error');
    destination.searchParams.set('provider', provider);
    destination.searchParams.set('message', errorMessage(error).slice(0, 300));
    return res.redirect(302, destination.toString());
  }
}
