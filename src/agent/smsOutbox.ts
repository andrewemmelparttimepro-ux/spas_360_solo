import { supabase } from '@/lib/supabase';
import { archiveAriOutput } from '@/agent/citadel';

/**
 * The approval-gated SMS pipeline. Ari NEVER sends — he queues. A human taps
 * Approve, and only then does /api/sms fire Twilio from the business number.
 * Every queued text is archived to the Citadel first, and an approved send is
 * recorded into the customer's sms communication thread exactly like a
 * human-sent text, so the conversation history stays whole.
 */

export interface PendingSms {
  id: string;
  contact_id: string;
  to_phone: string;
  body: string;
  status: 'pending_approval' | 'sent' | 'rejected' | 'failed';
  created_at: string;
  contact?: { first_name: string; last_name: string } | null;
}

/** Ari's side: archive to Citadel, queue for approval, ping the requester. */
export async function queueSmsForApproval(input: {
  contactId: string;
  contactName: string;
  toPhone: string;
  body: string;
  request: string;
}): Promise<{ outboxId: string } | { error: string }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Not signed in.' };
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', auth.user.id)
    .single();
  if (!profile?.org_id) return { error: 'Could not resolve your organization.' };

  // Canonical copy first — the Citadel holds it whether or not it ever sends.
  let deliverableId: string | null = null;
  try {
    const archived = await archiveAriOutput({
      content: input.body,
      request: input.request,
      title: `Text to ${input.contactName} (pending approval)`,
      customerId: input.contactId,
      deliveryChannels: ['sms:pending_approval'],
    });
    deliverableId = archived?.id ?? null;
  } catch {
    // Archive failure shouldn't block the queue — the outbox row is still auditable.
  }

  const { data: row, error } = await supabase
    .from('sms_outbox')
    .insert({
      org_id: profile.org_id,
      deliverable_id: deliverableId,
      contact_id: input.contactId,
      to_phone: input.toPhone,
      body: input.body,
      requested_by: auth.user.id,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };

  // The approval tap rides the existing notification → push pipeline.
  await supabase.from('notifications').insert({
    user_id: auth.user.id,
    type: 'sms_approval',
    title: `Ari queued a text to ${input.contactName}`,
    body: input.body.length > 120 ? `${input.body.slice(0, 117)}...` : input.body,
    link: '/communication?tab=customers&approvals=1',
  });

  return { outboxId: row.id };
}

/** Human side: the approve tap. Sends via Twilio, then records reality. */
export async function approveSms(item: PendingSms): Promise<{ error: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Not signed in.' };

  const session = await supabase.auth.getSession();
  const resp = await fetch('/api/sms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.data.session?.access_token}`,
    },
    body: JSON.stringify({ to: item.to_phone, body: item.body }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Send failed' }));
    const message = (err as { error?: string }).error ?? 'Send failed';
    // Twilio-not-configured stays pending (it can succeed later); real rejects mark failed.
    const isConfigGap = /not configured/i.test(message);
    if (!isConfigGap) {
      await supabase
        .from('sms_outbox')
        .update({ status: 'failed', error: message, decided_by: auth.user.id, decided_at: new Date().toISOString() })
        .eq('id', item.id);
    }
    return { error: message };
  }

  // Record into the customer's sms thread so history reads like any other text.
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id')
    .eq('id', auth.user.id)
    .single();
  let threadId: string | null = null;
  const { data: existing } = await supabase
    .from('communication_threads')
    .select('id')
    .eq('contact_id', item.contact_id)
    .eq('thread_type', 'sms')
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    threadId = existing.id;
  } else if (profile?.org_id) {
    const { data: created } = await supabase
      .from('communication_threads')
      .insert({ org_id: profile.org_id, contact_id: item.contact_id, thread_type: 'sms' })
      .select('id')
      .single();
    threadId = created?.id ?? null;
  }
  if (threadId) {
    await supabase.from('messages').insert({
      thread_id: threadId,
      sender_type: 'agent',
      sender_id: auth.user.id,
      body: item.body,
    });
    await supabase
      .from('communication_threads')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', threadId);
  }

  await supabase
    .from('sms_outbox')
    .update({ status: 'sent', decided_by: auth.user.id, decided_at: new Date().toISOString() })
    .eq('id', item.id);

  return { error: null };
}

export async function rejectSms(itemId: string): Promise<{ error: string | null }> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { error: 'Not signed in.' };
  const { error } = await supabase
    .from('sms_outbox')
    .update({ status: 'rejected', decided_by: auth.user.id, decided_at: new Date().toISOString() })
    .eq('id', itemId);
  return { error: error?.message ?? null };
}

export async function fetchPendingSms(): Promise<PendingSms[]> {
  const { data } = await supabase
    .from('sms_outbox')
    .select('id, contact_id, to_phone, body, status, created_at, contact:contact_id(first_name, last_name)')
    .eq('status', 'pending_approval')
    .order('created_at', { ascending: false })
    .limit(20);
  return (data as unknown as PendingSms[]) ?? [];
}
