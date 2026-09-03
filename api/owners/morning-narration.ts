import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Ari's three-sentence read of the Morning Summary. Owner-only. The summary is
 * pulled as the caller (RLS), narrated once per org per day through the normal
 * Ari door (/api/chat, no tools), and cached so the page never re-pays for it.
 */
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const CHAT_ORIGIN = (process.env.AGENT_API_BASE_URL || 'https://spas360solo.vercel.app').replace(/\/$/, '');

function bearer(req: VercelRequest): string | null {
  const raw = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function narrationPrompt(summary: Record<string, unknown>): string {
  return [
    'You are Ari, reading the Morning Summary to the dealership owner before the store opens.',
    'Write at most three short sentences in plain spoken English, no bullet points, no headings, no markdown.',
    'Lead with anything that needs the owner today (tasks left open at clock-out, overdue delegated work, a deal won or lost, a missed punch). If the day was quiet, say so in one sentence.',
    'Use first names only. Never invent numbers; every figure must come from the JSON below.',
    '',
    '### Morning Summary JSON',
    JSON.stringify(summary),
  ].join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE) return res.status(500).json({ error: 'Not configured' });
  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });
  const day = typeof req.query.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.day) ? req.query.day : null;
  const refresh = req.query.refresh === '1';

  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const asUser = createClient(SUPABASE_URL, SUPABASE_ANON, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: userData } = await asUser.auth.getUser(token);
  const userId = userData.user?.id;
  if (!userId) return res.status(401).json({ error: 'Invalid or expired session' });
  const { data: profile } = await asUser.from('profiles').select('org_id, role').eq('id', userId).single();
  if (!profile || profile.role !== 'owner_manager') return res.status(403).json({ error: 'Owner access required' });

  const { data: summary, error: summaryError } = await asUser.rpc('owner_morning_summary', { p_day: day });
  if (summaryError || !summary) return res.status(500).json({ error: summaryError?.message ?? 'Summary unavailable' });
  const summaryDay = String((summary as { day?: string }).day ?? day ?? '');

  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE, options);
  if (!refresh) {
    const { data: cached } = await service
      .from('morning_summary_narrations')
      .select('narration, model, created_at')
      .eq('org_id', profile.org_id)
      .eq('day', summaryDay)
      .maybeSingle();
    if (cached?.narration) return res.status(200).json({ day: summaryDay, narration: cached.narration, model: cached.model, cached: true });
  }

  let narration = '';
  let model: string | null = null;
  try {
    const response = await fetch(`${CHAT_ORIGIN}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: narrationPrompt(summary as Record<string, unknown>) }], tools: [] }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json().catch(() => null) as { choices?: { message?: { content?: string } }[]; model?: string; error?: string } | null;
    if (!response.ok) throw new Error(payload?.error ?? `Ari returned HTTP ${response.status}`);
    narration = (payload?.choices?.[0]?.message?.content ?? '').replace(/\s+/g, ' ').trim();
    model = payload?.model ?? null;
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Ari could not narrate the summary' });
  }
  if (!narration) return res.status(502).json({ error: 'Ari returned an empty narration' });

  await service.from('morning_summary_narrations').upsert(
    { org_id: profile.org_id, day: summaryDay, narration, model, created_by: userId },
    { onConflict: 'org_id,day' },
  );
  return res.status(200).json({ day: summaryDay, narration, model, cached: false });
}
