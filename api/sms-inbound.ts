import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Twilio inbound-SMS webhook. Validates the X-Twilio-Signature, matches the
 * sender to a contact by phone, files the text into that contact's SMS thread
 * (creating contact/thread if new), and notifies the assigned salesperson +
 * managers. Writes use the service-role key — Twilio has no user session.
 *
 * Twilio console → phone number → Messaging → "A message comes in":
 *   https://spas360solo.vercel.app/api/sms-inbound   (HTTP POST)
 */

const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const WEBHOOK_URL = process.env.TWILIO_WEBHOOK_URL || 'https://spas360solo.vercel.app/api/sms-inbound';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).send('Method not allowed');
  if (!SERVICE_KEY || !SUPABASE_URL || !TWILIO_TOKEN) return res.status(500).send('Not configured');

  const params = req.body as Record<string, string>;
  const signature = (req.headers['x-twilio-signature'] as string) ?? '';
  if (!validSignature(params, signature)) return res.status(403).send('Bad signature');

  const from = params.From ?? '';
  const body = (params.Body ?? '').trim();
  if (!from || !body) return res.status(200).send('<Response/>');

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
