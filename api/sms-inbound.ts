import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'crypto';
import { waitUntil } from '@vercel/functions';
import { sendText } from './sms.js';
import {
  askAriAsStaff,
  findStaffByPhone,
  makeClients,
  mintStaffAccessToken,
  smsReplyText,
  type StaffProfile,
} from './_lib/staff-sms.js';

/**
 * Twilio inbound-SMS webhook. Validates the X-Twilio-Signature, then:
 *   • a text from a TEAMMATE's mobile (profiles.phone) is handed to Ari as
 *     that teammate — "Ari, delegate a task to Alex …" — and Ari's answer is
 *     texted back from the business number;
 *   • anything else is a customer text: matched to a contact by phone (or a
 *     new Unknown Lead), filed into their SMS thread, and staff are notified.
 * Writes use the service-role key — Twilio has no user session.
 *
 * Twilio console → phone number → Messaging → "A message comes in":
 *   https://spas360solo.vercel.app/api/sms-inbound   (HTTP POST)
 */

const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY;
const WEBHOOK_URL = process.env.TWILIO_WEBHOOK_URL || 'https://spas360solo.vercel.app/api/sms-inbound';
const APP_ORIGIN = (process.env.AGENT_API_BASE_URL || 'https://spas360solo.vercel.app').replace(/\/$/, '');

function validSignature(params: Record<string, string>, signature: string): boolean {
  if (!TWILIO_TOKEN) return false;
  // Twilio signs: URL + params concatenated as key+value, keys sorted
  const data = WEBHOOK_URL + Object.keys(params).sort().map(k => k + params[k]).join('');
  const expected = createHmac('sha1', TWILIO_TOKEN).update(Buffer.from(data, 'utf-8')).digest('base64');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });
  return { ok: res.ok, data: res.ok ? await res.json() : await res.text() };
}

async function staffForNumber(from: string): Promise<StaffProfile | null> {
  const digits = from.replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return null;
  const { ok, data } = await sb(`profiles?select=id,org_id,email,first_name,last_name,phone&phone=ilike.*${digits.slice(0, 3)}*${digits.slice(3, 6)}*${digits.slice(6)}*&limit=5`);
  if (!ok || !Array.isArray(data)) return null;
  return findStaffByPhone(data as StaffProfile[], from);
}

const STAFF_FALLBACK = "Ari couldn't finish that one from a text. Try again in a minute, or open SPAS 360.";

async function handleStaffText(staff: StaffProfile, from: string, body: string): Promise<void> {
  let reply = STAFF_FALLBACK;
  try {
    if (!SUPABASE_ANON) throw new Error('Anon key missing');
    const { service, anon } = makeClients(SUPABASE_URL!, SUPABASE_ANON, SERVICE_KEY!);
    const token = await mintStaffAccessToken(service, anon, staff.email);
    reply = smsReplyText(await askAriAsStaff(APP_ORIGIN, token, body));
  } catch (error) {
    console.error('staff sms → Ari failed', { staff: staff.id, detail: error instanceof Error ? error.message : String(error) });
  }
  const sent = await sendText(from, reply);
  if ('error' in sent) console.error('staff sms reply failed', { staff: staff.id, error: sent.error });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!SERVICE_KEY || !SUPABASE_URL || !TWILIO_TOKEN) return res.status(500).send('Not configured');

  const params = req.body as Record<string, string>;
  const signature = (req.headers['x-twilio-signature'] as string) ?? '';
  if (!validSignature(params, signature)) return res.status(403).send('Bad signature');

  const from = params.From ?? '';
  const body = (params.Body ?? '').trim();
  if (!from || !body) return res.status(200).send('<Response/>');

  // 0. A teammate texting from their own mobile talks to Ari, not to the CRM.
  //    Twilio needs its answer within 15s; Ari's answer goes back as a fresh text.
  const staff = await staffForNumber(from);
  if (staff) {
    res.setHeader('Content-Type', 'text/xml');
    res.status(200).send('<Response/>');
    waitUntil(handleStaffText(staff, from, body));
    return;
  }

  const last10 = from.replace(/\D/g, '').slice(-10);

  // 1. Match (or create) the contact by phone
  let contact: { id: string; org_id: string; assigned_to: string | null } | null = null;
  {
    const { ok, data } = await sb(`contacts?select=id,org_id,assigned_to&phone=ilike.*${last10.slice(0, 3)}*${last10.slice(3, 6)}*${last10.slice(6)}*&limit=1`);
    if (ok && Array.isArray(data) && data[0]) contact = data[0];
  }
  if (!contact) {
    // Unknown number → create a Lead so no inbound text is ever lost
    const { data: orgs } = await sb('organizations?select=id&limit=1');
    const orgId = Array.isArray(orgs) ? orgs[0]?.id : null;
    if (!orgId) return res.status(200).send('<Response/>');
    const { ok, data } = await sb('contacts', {
      method: 'POST',
      body: JSON.stringify({
        org_id: orgId, first_name: 'Unknown', last_name: from, phone: from,
        lead_source: 'Phone', customer_type: 'Lead',
      }),
    });
    if (ok && Array.isArray(data) && data[0]) contact = data[0];
  }
  if (!contact) return res.status(200).send('<Response/>');

  // 2. Find or create the SMS thread
  let threadId: string | null = null;
  {
    const { ok, data } = await sb(`communication_threads?select=id&contact_id=eq.${contact.id}&thread_type=eq.sms&limit=1`);
    if (ok && Array.isArray(data) && data[0]) threadId = data[0].id;
  }
  if (!threadId) {
    const { ok, data } = await sb('communication_threads', {
      method: 'POST',
      body: JSON.stringify({ org_id: contact.org_id, contact_id: contact.id, thread_type: 'sms' }),
    });
    if (ok && Array.isArray(data) && data[0]) threadId = data[0].id;
  }
  if (!threadId) return res.status(200).send('<Response/>');

  // 3. File the message + bump the thread
  await sb('messages', {
    method: 'POST',
    body: JSON.stringify({ thread_id: threadId, sender_type: 'customer', body }),
  });
  await sb(`communication_threads?id=eq.${threadId}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_message_at: new Date().toISOString() }),
  });

  // 4. Notify the assigned salesperson + managers
  const { ok: mgrOk, data: mgrs } = await sb(
    `profiles?select=id&org_id=eq.${contact.org_id}&role=in.(owner_manager,service_manager)`
  );
  const recipients = new Set<string>(mgrOk && Array.isArray(mgrs) ? mgrs.map((m: { id: string }) => m.id) : []);
  if (contact.assigned_to) recipients.add(contact.assigned_to);
  if (recipients.size > 0) {
    await sb('notifications', {
      method: 'POST',
      body: JSON.stringify([...recipients].map(id => ({
        user_id: id,
        type: 'message',
        title: `Text from ${from}`,
        body: body.length > 80 ? body.slice(0, 80) + '…' : body,
        link: '/communication',
      }))),
    });
  }

  res.setHeader('Content-Type', 'text/xml');
  return res.status(200).send('<Response/>');
}
