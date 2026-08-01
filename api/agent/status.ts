import type { VercelRequest, VercelResponse } from '@vercel/node';

const envValue = (value: string | undefined, fallback = '') => (value || fallback).trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const supabaseUrl = envValue(process.env.VITE_SUPABASE_URL);
  const anonKey = envValue(process.env.VITE_SUPABASE_ANON_KEY);
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  if (!authHeader || !supabaseUrl || !anonKey) return res.status(401).json({ error: 'Missing authorization' });
  const auth = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: authHeader },
  });
  if (!auth.ok) return res.status(401).json({ error: 'Invalid or expired session' });

  // The org's agent_config row overrides env — same resolution chat.ts uses,
  // so this card always reports the brain that would actually answer. RLS
  // scopes the read to the caller's org; a missing row falls back to env.
  let configured: { enabled?: boolean; provider?: string | null; model?: string | null } = {};
  try {
    const r = await fetch(
      `${supabaseUrl}/rest/v1/agent_config?select=enabled,provider,model&limit=1`,
      { headers: { apikey: anonKey, Authorization: authHeader, Accept: 'application/json' } }
    );
    if (r.ok) {
      const rows = (await r.json()) as typeof configured[];
      if (Array.isArray(rows) && rows[0]) configured = rows[0];
    }
  } catch { /* env fallback */ }

  const provider = (configured.provider || envValue(process.env.AI_PROVIDER, 'gemini')).toLowerCase();
  const envModel = provider === 'grok' || provider === 'xai'
    ? envValue(process.env.XAI_MODEL, 'grok-4.5')
    : provider === 'glm' || provider === 'zai'
    ? envValue(process.env.GLM_MODEL, 'glm-5.2')
    : provider === 'meta' || provider === 'spark' || provider === 'muse'
      ? envValue(process.env.META_MODEL, 'muse-spark-1.1')
    : provider === 'anthropic'
      ? envValue(process.env.ANTHROPIC_MODEL, 'claude-sonnet-4-6')
      : provider === 'openai'
        ? envValue(process.env.OPENAI_MODEL, 'gpt-4o-mini')
        : envValue(process.env.GEMINI_MODEL, 'gemini-2.0-flash');
  const model = configured.model || envModel;

  // Which providers this deployment can actually run — key presence, never
  // key values. Admin consoles read this to enable/disable picker options,
  // so adding a key to Vercel lights the option up everywhere on the next
  // status poll with no client release.
  const providers_available = {
    anthropic: Boolean(envValue(process.env.ANTHROPIC_API_KEY)),
    gemini: Boolean(envValue(process.env.GEMINI_API_KEY)),
    openai: Boolean(envValue(process.env.OPENAI_API_KEY)),
    glm: Boolean(envValue(process.env.GLM_API_KEY || process.env.ZAI_API_KEY)),
    meta: Boolean(envValue(process.env.MODEL_API_KEY || process.env.META_MODEL_API_KEY)),
    grok: Boolean(envValue(process.env.XAI_API_KEY)),
  };

  return res.status(200).json({
    ok: true,
    enabled: configured.enabled !== false,
    provider,
    model,
    config_source: configured.provider || configured.model ? 'org-config' : 'env',
    providers_available,
    capabilities: ['tools', 'threads', 'citadel', 'sms_approval', 'service_holds'],
    server_time: new Date().toISOString(),
  });
}
