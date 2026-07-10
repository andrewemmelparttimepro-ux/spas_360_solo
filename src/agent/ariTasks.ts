import { supabase } from '@/lib/supabase';
import { runAgentTask } from '@/agent/run';
import { stripMentions, toAgentText } from '@/lib/mentions';

// @Ari on a deal or customer: gather the verified data packet HERE (no tool
// roundtrips for what we already know), hand it to Ari with the request, and
// return the finished deliverable. "Take this customer and the deal packet and
// make me a 1-page sales tool" — this is that.

async function buildDealPacket(dealId: string): Promise<string> {
  const [dealRes, invRes, notesRes, tasksRes] = await Promise.all([
    supabase.from('deals').select('*, contact:contact_id(*), stage:stage_id(name)').eq('id', dealId).single(),
    supabase.from('inventory_items').select('sku, product, brand, category, model, color_finish, status, msrp, sale_price, warranty_info, notes').eq('deal_id', dealId),
    supabase.from('notes').select('body, created_at').eq('deal_id', dealId).order('created_at', { ascending: false }).limit(5),
    supabase.from('tasks').select('title, status, due_at').eq('deal_id', dealId).in('status', ['Pending', 'In Progress']),
  ]);
  if (dealRes.error || !dealRes.data) throw new Error('Could not load the deal packet.');
  return JSON.stringify({
    deal: dealRes.data,
    linked_inventory_units: invRes.data ?? [],
    recent_notes: (notesRes.data ?? []).map(n => ({ ...n, body: stripMentions(n.body ?? '') })),
    open_tasks: tasksRes.data ?? [],
  }, null, 2);
}

async function buildContactPacket(contactId: string): Promise<string> {
  const [contactRes, dealsRes, jobsRes, invRes, notesRes] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', contactId).single(),
    supabase.from('deals').select('title, amount, priority, product_interest, expected_close_date, stage:stage_id(name)').eq('contact_id', contactId),
    supabase.from('jobs').select('title, job_type, status, scheduled_at').eq('contact_id', contactId),
    supabase.from('inventory_items').select('sku, product, brand, model, status, msrp, sale_price').eq('customer_id', contactId),
    supabase.from('notes').select('body, created_at').eq('contact_id', contactId).order('created_at', { ascending: false }).limit(5),
  ]);
  if (contactRes.error || !contactRes.data) throw new Error('Could not load the customer packet.');
  return JSON.stringify({
    customer: contactRes.data,
    deals: dealsRes.data ?? [],
    service_jobs: jobsRes.data ?? [],
    equipment_owned: invRes.data ?? [],
    recent_notes: (notesRes.data ?? []).map(n => ({ ...n, body: stripMentions(n.body ?? '') })),
  }, null, 2);
}

export async function runAriMention(opts: {
  surface: 'deal' | 'contact';
  entityId: string;
  request: string; // raw body with tokens
  requesterName: string;
}): Promise<string> {
  const packet = opts.surface === 'deal'
    ? await buildDealPacket(opts.entityId)
    : await buildContactPacket(opts.entityId);

  const content = [
    `${opts.requesterName} @-mentioned you in a note on a ${opts.surface === 'deal' ? 'deal' : 'customer'} in SPAS 360.`,
    `Do the work now and reply with ONLY the finished deliverable — clean, copy-ready markdown. It will be saved as a note on this ${opts.surface} for ${opts.requesterName} to use. No preamble, no "here you go".`,
    `The verified data packet is below — use it as your source of truth. Only reach for tools if you need something that is not in the packet. Never invent numbers; unknowns become [CONFIRM: …].`,
    '',
    '### Data packet',
    packet,
    '',
    `### Request from ${opts.requesterName}`,
    toAgentText(opts.request),
  ].join('\n');

  return runAgentTask(content);
}

export async function runAriChatMention(opts: {
  channelTitle: string;
  senderName: string;
  message: string; // raw body with tokens
  recentLines: string[]; // "Name: text" lines, oldest first
}): Promise<string> {
  const content = [
    `You've been @-mentioned in the SPAS 360 team chat channel "${opts.channelTitle}". Reply as a chat message to the channel — direct and punchy, formatted for a small chat bubble. If the ask needs real data, use your tools.`,
    '',
    opts.recentLines.length > 0 ? `### Recent conversation\n${opts.recentLines.join('\n')}` : '',
    '',
    `### ${opts.senderName} just said`,
    toAgentText(opts.message),
  ].filter(Boolean).join('\n');

  return runAgentTask(content);
}
