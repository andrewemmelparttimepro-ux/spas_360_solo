import { randomUUID } from 'node:crypto';
import { submitMorningEmail, type EmailPayload } from '../_lib/morningDelivery.js';
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

function emailPayload(to: string, subject: string, html: string, text: string, from = FROM): EmailPayload {
  return { from, to: [to], subject, html, text, tags: [{ name: 'app', value: 'spas360' }, { name: 'kind', value: 'morning-summary' }] };
}

async function narrationFor(service: SupabaseClient, anon: SupabaseClient, orgId: string, day: string, ownerEmail: string): Promise<string | null> {
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
  if (query.receipts === '1') {
    let receiptQuery = service.from('morning_summary_emails').select('id,org_id,day,to_email,provider_id,status,provider_event,provider_checked_at,error').order('created_at', { ascending: false }).limit(20);
    if (callerOrg) receiptQuery = receiptQuery.eq('org_id', callerOrg);
    const { data: rows, error: readError } = await receiptQuery;
    if (readError) return res.status(503).json({ error: 'Email receipts could not load' });
    const receipts = [];
    for (const row of rows ?? []) {
      if (!row.provider_id) { receipts.push(row); continue; }
      try {
        const reply = await fetch(`https://api.resend.com/emails/${encodeURIComponent(row.provider_id as string)}`, {
          headers: { Authorization: `Bearer ${RESEND_API_KEY}` }, signal: AbortSignal.timeout(4_000),
        });
        const receipt = await reply.json() as { last_event?: string };
        if (!reply.ok || !receipt.last_event) { receipts.push({ ...row, verification_error: `Provider receipt unavailable (${reply.status})` }); continue; }
        const update = { provider_event: receipt.last_event, provider_checked_at: new Date().toISOString() };
        await service.from('morning_summary_emails').update(update).eq('id', row.id);
        receipts.push({ ...row, ...update });
      } catch { receipts.push({ ...row, verification_error: 'Provider receipt check timed out' }); }
    }
    return res.status(200).json({ receipts, note: 'Sent means provider accepted. Delivered means recipient mail server accepted; it does not prove the recipient read it.' });
  }

  const test = query.test === '1';
  const testTo = typeof query.to === 'string' ? query.to : null;
  // Test sends may use Resend's onboarding sender until spas360.ndai.pro is verified.
  const testFrom = test && typeof query.from === 'string' && /^[^<>\s]+@[^<>\s]+$/.test(query.from) ? query.from : FROM;
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
      const sent = await submitMorningEmail(RESEND_API_KEY, emailPayload(to, `[TEST] ${subject}`, html, text, testFrom), `spas360/test/${randomUUID()}`);
      results.push({ org: orgId, test: true, to, ...sent });
      continue;
    }

    for (const owner of recipients) {
      const { data: claim, error: claimError } = await service.rpc('claim_morning_delivery', {
        p_org: orgId, p_day: typed.day, p_user: owner.id,
        p_payload: emailPayload(owner.email as string, subject, html, text),
      });
      if (claimError || !claim?.claimed) {
        results.push({ org: orgId, to: owner.email, skipped: claim?.reason ?? 'Delivery claim unavailable', error: claimError?.message });
        continue;
      }
      const sent = await submitMorningEmail(RESEND_API_KEY, claim.payload as EmailPayload, claim.idempotency_key as string);
      const { data: recorded, error: receiptError } = await service.rpc('finish_morning_delivery', {
        p_email: claim.email_id, p_lease: claim.lease_token,
        p_provider: 'id' in sent ? sent.id : null, p_error: 'error' in sent ? sent.error : null,
      });
      results.push({ org: orgId, to: owner.email, ...sent, receipt_recorded: !receiptError && recorded === true });
    }
  }

  return res.status(200).json({ ok: true, day, results });
}
