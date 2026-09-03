import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintStaffAccessToken } from '../_lib/staff-sms.js';
import { morningEmailHtml, morningEmailSubject, morningEmailText, type EmailSummary } from '../_lib/morning-email.js';

/**
 * Emails the Morning Summary to every owner. Called by pg_cron at 7:35 AM
 * Central (secret header) or by hand with ?test=1&to=someone (secret header
 * or an owner session). One email per owner per day, logged, never duplicated.
 */
const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const SUPABASE_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || '').trim();
const FROM = (process.env.MORNING_SUMMARY_FROM || 'Ari at SPAS 360 <ari@spas360.ndai.pro>').trim();
const SECRET = (process.env.MORNING_SUMMARY_SECRET || '').trim();
const APP_URL = (process.env.AGENT_API_BASE_URL || 'https://spas360solo.vercel.app').replace(/\/$/, '');

function header(req: VercelRequest, name: string): string {
  const raw = req.headers[name];
  return (Array.isArray(raw) ? raw[0] : raw) ?? '';
}

function secretOk(req: VercelRequest): boolean {
  const given = header(req, 'x-morning-secret');
  if (!SECRET || !given || given.length !== SECRET.length) return false;
  let mismatch = 0;
  for (let i = 0; i < given.length; i++) mismatch |= given.charCodeAt(i) ^ SECRET.charCodeAt(i);
  return mismatch === 0;
}

async function sendViaResend(to: string, subject: string, html: string, text: string): Promise<{ id: string } | { error: string }> {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'spas360-morning-summary' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html, text, tags: [{ name: 'app', value: 'spas360' }, { name: 'kind', value: 'morning-summary' }] }),
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json().catch(() => null) as { id?: string; message?: string; name?: string } | null;
  if (!response.ok || !payload?.id) return { error: payload?.message ?? `Resend HTTP ${response.status}` };
  return { id: payload.id };
}

async function narrationFor(service: SupabaseClient, anon: SupabaseClient, orgId: string, day: string, ownerEmail: string): Promise<string | null> {
  const { data: cached } = await service.from('morning_summary_narrations').select('narration').eq('org_id', orgId).eq('day', day).maybeSingle();
  if (cached?.narration) return cached.narration as string;
  try {
    const token = await mintStaffAccessToken(service, anon, ownerEmail);
    const response = await fetch(`${APP_URL}/api/owners/morning-narration?day=${day}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(70_000) });
    const payload = await response.json().catch(() => null) as { narration?: string } | null;
    return response.ok && payload?.narration ? payload.narration : null;
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'POST only' });
  if (!SUPABASE_URL || !SUPABASE_ANON || !SUPABASE_SERVICE) return res.status(500).json({ error: 'Supabase not configured' });
  if (!RESEND_API_KEY) return res.status(500).json({ error: 'RESEND_API_KEY missing' });

  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const service = createClient(SUPABASE_URL, SUPABASE_SERVICE, options);
  const anon = createClient(SUPABASE_URL, SUPABASE_ANON, options);

  // Auth: the cron secret, or an owner's own session for a manual test.
  let callerOrg: string | null = null;
  let callerEmail: string | null = null;
  if (!secretOk(req)) {
    const bearer = header(req, 'authorization').replace(/^Bearer\s+/i, '');
    if (!bearer) return res.status(401).json({ error: 'Missing secret or session' });
    const asUser = createClient(SUPABASE_URL, SUPABASE_ANON, { ...options, global: { headers: { Authorization: `Bearer ${bearer}` } } });
    const { data: userData } = await asUser.auth.getUser(bearer);
    if (!userData.user) return res.status(401).json({ error: 'Invalid session' });
    const { data: profile } = await asUser.from('profiles').select('org_id, role, email').eq('id', userData.user.id).single();
    if (!profile || profile.role !== 'owner_manager') return res.status(403).json({ error: 'Owner access required' });
    callerOrg = profile.org_id as string;
    callerEmail = profile.email as string;
  }

  const query = req.query as Record<string, string | string[] | undefined>;
  const test = query.test === '1';
  const testTo = typeof query.to === 'string' ? query.to : null;
  const day = typeof query.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(query.day) ? query.day : null;

  const { data: orgs } = callerOrg
    ? { data: [{ id: callerOrg }] }
    : await service.from('organizations').select('id');
  const results: unknown[] = [];

  for (const org of orgs ?? []) {
    const orgId = org.id as string;
    const { data: summary, error: summaryError } = await service.rpc('morning_summary_for_org', { p_org: orgId, p_day: day });
    if (summaryError || !summary) { results.push({ org: orgId, error: summaryError?.message ?? 'no summary' }); continue; }
    const typed = summary as EmailSummary;

    const { data: owners } = await service
      .from('profiles')
      .select('id, email, first_name, morning_summary_email')
      .eq('org_id', orgId)
      .eq('role', 'owner_manager')
      .eq('morning_summary_email', true);
    const recipients = (owners ?? []).filter(o => o.email && !/@ndai\.pro$/i.test(o.email as string));
    const narrationEmail = (recipients[0]?.email as string | undefined) ?? callerEmail ?? null;
    const narration = narrationEmail ? await narrationFor(service, anon, orgId, typed.day, narrationEmail) : null;

    const subject = morningEmailSubject(typed);
    const html = morningEmailHtml(typed, narration, APP_URL);
    const text = morningEmailText(typed, narration, APP_URL);

    if (test) {
      const to = testTo ?? callerEmail;
      if (!to) { results.push({ org: orgId, error: 'test needs ?to=' }); continue; }
      const sent = await sendViaResend(to, `[TEST] ${subject}`, html, text);
      results.push({ org: orgId, test: true, to, ...sent });
      continue;
    }

    for (const owner of recipients) {
      const { data: already } = await service.from('morning_summary_emails').select('id').eq('org_id', orgId).eq('day', typed.day).eq('user_id', owner.id as string).maybeSingle();
      if (already) { results.push({ org: orgId, to: owner.email, skipped: 'already sent' }); continue; }
      const sent = await sendViaResend(owner.email as string, subject, html, text);
      await service.from('morning_summary_emails').insert({
        org_id: orgId, day: typed.day, user_id: owner.id as string, to_email: owner.email as string,
        provider_id: 'id' in sent ? sent.id : null, status: 'id' in sent ? 'sent' : 'failed', error: 'error' in sent ? sent.error : null,
      });
      results.push({ org: orgId, to: owner.email, ...sent });
    }
  }

  return res.status(200).json({ ok: true, day, results });
}
