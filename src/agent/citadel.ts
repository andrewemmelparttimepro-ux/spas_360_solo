import { supabase } from '@/lib/supabase';

export type DeliverableKind =
  | 'sales_tool'
  | 'one_pager'
  | 'email'
  | 'sms'
  | 'document'
  | 'summary'
  | 'proposal'
  | 'other';

export interface CitadelArchiveInput {
  content: string;
  request?: string;
  title?: string;
  threadId?: string | null;
  customerId?: string | null;
  dealId?: string | null;
  deliveryChannels?: string[];
}

function compact(value: string): string {
  return value.replace(/\[\[(?:ari|user|customer):[^\]]+\]\]/gi, '').replace(/\s+/g, ' ').trim();
}

export function inferDeliverableKind(request: string, content: string): DeliverableKind {
  const text = `${request}\n${content}`.toLowerCase();
  if (/\b(email|subject line)\b/.test(text)) return 'email';
  if (/\b(sms|text message)\b/.test(text)) return 'sms';
  if (/\b(proposal)\b/.test(text)) return 'proposal';
  if (/\b(one[- ]pager|1[- ]page|one page)\b/.test(text)) return 'one_pager';
  if (/\b(summary|recap|brief)\b/.test(text)) return 'summary';
  if (/\b(sales tool|objection|battle card|follow-up cadence)\b/.test(text)) return 'sales_tool';
  if (/\b(document|special offer|trade-in offer|quote)\b/.test(text)) return 'document';
  return 'other';
}

export function buildCitadelTitle(request: string, explicitTitle?: string): string {
  const source = compact(explicitTitle || request) || 'Ari output';
  return source.length > 140 ? `${source.slice(0, 137)}...` : source;
}

/**
 * Persist Ari's canonical copy before the caller publishes it to chat, a note,
 * email, or text surface. This intentionally uses the signed-in user's session:
 * the Citadel's RLS policy keeps every archive inside that user's organization.
 */
export async function archiveAriOutput(input: CitadelArchiveInput) {
  const content = input.content.trim();
  if (!content) throw new Error('Cannot archive an empty Ari output.');

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Could not verify who requested this Ari output.');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', auth.user.id)
    .single();
  if (profileError || !profile?.org_id) throw new Error('Could not resolve the Citadel organization.');

  const channels = Array.from(new Set(['citadel', ...(input.deliveryChannels ?? [])]));
  const { data, error } = await supabase
    .from('agent_deliverables')
    .insert({
      org_id: profile.org_id,
      thread_id: input.threadId ?? null,
      requested_by: auth.user.id,
      customer_id: input.customerId ?? null,
      deal_id: input.dealId ?? null,
      kind: inferDeliverableKind(input.request ?? '', content),
      title: buildCitadelTitle(input.request ?? '', input.title),
      content,
      content_format: 'markdown',
      delivery_channels: channels,
    })
    .select('id, created_at')
    .single();

  if (error) throw new Error(`Citadel archive failed: ${error.message}`);
  return data;
}
