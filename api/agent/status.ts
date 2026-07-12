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

  const provider = envValue(process.env.AI_PROVIDER, 'gemini').toLowerCase();
  const model = provider === 'glm' || provider === 'zai'
    ? envValue(process.env.GLM_MODEL, 'glm-5.2')
    : provider === 'anthropic'
      ? envValue(process.env.ANTHROPIC_MODEL, 'claude-sonnet-4-6')
      : provider === 'openai'
        ? envValue(process.env.OPENAI_MODEL, 'gpt-4o-mini')
        : envValue(process.env.GEMINI_MODEL, 'gemini-2.0-flash');

  return res.status(200).json({
    ok: true,
    provider,
    model,
    capabilities: ['tools', 'threads', 'citadel', 'sms_approval', 'service_holds'],
    server_time: new Date().toISOString(),
  });
}
