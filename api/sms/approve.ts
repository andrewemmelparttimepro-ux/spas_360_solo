import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendText } from '../sms.js';

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const authHeader = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPABASE_URL || !SUPABASE_ANON) return res.status(401).json({ error: 'Missing authorization' });

  const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData } = await client.auth.getUser(token);
  const userId = userData.user?.id;
  if (!userId) return res.status(401).json({ error: 'Invalid or expired session' });

  const outboxId = typeof req.body?.outbox_id === 'string' ? req.body.outbox_id : '';
  if (!outboxId) return res.status(400).json({ error: 'outbox_id is required' });

  const { data: item } = await client
    .from('sms_outbox')
    .select('id, org_id, contact_id, to_phone, body, status')
    .eq('id', outboxId)
    .maybeSingle();
  if (!item) return res.status(404).json({ error: 'Approval item not found' });
  if (item.status === 'sent') return res.status(200).json({ sent: true, already_decided: true });
  if (item.status !== 'pending_approval') return res.status(409).json({ error: `Text is already ${item.status}` });

  // Claim first. A second simultaneous approval cannot send the same text twice.
  const { data: claimed, error: claimError } = await client
    .from('sms_outbox')
    .update({ status: 'sending', decided_by: userId, decided_at: new Date().toISOString(), error: null })
    .eq('id', outboxId)
    .eq('status', 'pending_approval')
    .select('id')
    .maybeSingle();
  if (claimError) return res.status(403).json({ error: claimError.message });
  if (!claimed) return res.status(409).json({ error: 'Another person is already deciding this text' });

  const send = await sendText(item.to_phone, item.body);
  if ('error' in send) {
    await client.from('sms_outbox').update({
      status: send.configurationGap ? 'pending_approval' : 'failed',
      error: send.error,
      decided_by: send.configurationGap ? null : userId,
      decided_at: send.configurationGap ? null : new Date().toISOString(),
    }).eq('id', outboxId);
    return res.status(send.statusCode).json({ error: send.error });
  }

  // Mark reality immediately after Twilio accepts it; history repair can safely retry.
  await client.from('sms_outbox').update({
    status: 'sent',
    error: null,
    decided_by: userId,
    decided_at: new Date().toISOString(),
  }).eq('id', outboxId);

  let threadId: string | null = null;
  const { data: existing } = await client
    .from('communication_threads')
    .select('id')
    .eq('contact_id', item.contact_id)
    .eq('thread_type', 'sms')
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    threadId = existing.id;
  } else {
    const { data: created } = await client
      .from('communication_threads')
      .insert({ org_id: item.org_id, contact_id: item.contact_id, thread_type: 'sms' })
      .select('id')
      .single();
    threadId = created?.id ?? null;
  }
  if (threadId) {
    await client.from('messages').insert({
      thread_id: threadId,
      sender_type: 'agent',
      sender_id: userId,
      body: item.body,
    });
    await client.from('communication_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);
  }

  return res.status(200).json({ sent: true, sid: send.sid, status: send.status, thread_id: threadId });
}
