import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createAgentTools,
  executeToolFrom,
  getOpenAITools,
  type AgentToolQueueSms,
} from '../../src/agent/toolFactory.js';

type ApiMessage = {
  role: 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type?: 'function';
  function: { name: string; arguments: string };
};

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_ANON = (process.env.VITE_SUPABASE_ANON_KEY || '').trim();
const CHAT_ORIGIN = (process.env.AGENT_API_BASE_URL || 'https://spas360solo.vercel.app').replace(/\/$/, '');

function bearer(req: VercelRequest): string | null {
  const raw = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function clientFor(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function inferKind(request: string, content: string): string {
  const text = `${request}\n${content}`.toLowerCase();
  if (/\b(email|subject line)\b/.test(text)) return 'email';
  if (/\b(sms|text message)\b/.test(text)) return 'sms';
  if (/\bproposal\b/.test(text)) return 'proposal';
  if (/\b(one[- ]pager|1[- ]page|one page)\b/.test(text)) return 'one_pager';
  if (/\b(summary|recap|brief)\b/.test(text)) return 'summary';
  if (/\b(sales tool|objection|battle card|follow-up cadence)\b/.test(text)) return 'sales_tool';
  if (/\b(document|special offer|trade-in offer|quote)\b/.test(text)) return 'document';
  return 'other';
}

function compactTitle(value: string): string {
  const clean = value.replace(/\[\[(?:ari|user|customer):[^\]]+\]\]/gi, '').replace(/\s+/g, ' ').trim();
  return clean.length > 140 ? `${clean.slice(0, 137)}...` : clean || 'Ari output';
}

async function queueSmsWith(
  client: SupabaseClient,
  userId: string,
  orgId: string,
  input: Parameters<AgentToolQueueSms>[0],
): Promise<{ outboxId: string } | { error: string }> {
  const { data: deliverable } = await client
    .from('agent_deliverables')
    .insert({
      org_id: orgId,
      requested_by: userId,
      customer_id: input.contactId,
      kind: 'sms',
      title: `Text to ${input.contactName} (pending approval)`,
      content: input.body,
      content_format: 'markdown',
      delivery_channels: ['citadel', 'sms:pending_approval'],
    })
    .select('id')
    .single();

  const { data: row, error } = await client
    .from('sms_outbox')
    .insert({
      org_id: orgId,
      deliverable_id: deliverable?.id ?? null,
      contact_id: input.contactId,
      to_phone: input.toPhone,
      body: input.body,
      requested_by: userId,
    })
    .select('id')
    .single();
  if (error || !row?.id) {
    if (deliverable?.id) await client.from('agent_deliverables').delete().eq('id', deliverable.id);
    return { error: error?.message ?? 'Could not queue the text.' };
  }

  await client.from('notifications').insert({
    user_id: userId,
    type: 'sms_approval',
    title: `Ari queued a text to ${input.contactName}`,
    body: input.body.length > 120 ? `${input.body.slice(0, 117)}...` : input.body,
    link: '/communication?tab=customers&approvals=1',
  });
  return { outboxId: row.id as string };
}

async function callAri(token: string, messages: ApiMessage[], tools: unknown[]): Promise<ApiMessage> {
  const response = await fetch(`${CHAT_ORIGIN}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ messages, tools }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const raw = await response.text();
    if (raw.includes('content_policy_violation')) {
      throw new Error('Ari content policy response');
    }
    throw new Error(raw.slice(0, 1000) || `Ari returned HTTP ${response.status}`);
  }
  const data = await response.json() as { choices?: { message?: ApiMessage }[] };
  const message = data.choices?.[0]?.message;
  if (!message) throw new Error('Ari returned no message.');
  return message;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const requestId = randomUUID();
  res.setHeader('X-Request-ID', requestId);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!SUPABASE_URL || !SUPABASE_ANON) return res.status(500).json({ error: 'Agent runtime is not configured' });

  const token = bearer(req);
  if (!token) return res.status(401).json({ error: 'Missing authorization' });

  const client = clientFor(token);
  const { data: userData, error: userError } = await client.auth.getUser(token);
  const userId = userData.user?.id;
  if (userError || !userId) return res.status(401).json({ error: 'Invalid or expired session' });

  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const requestedThreadId = typeof req.body?.thread_id === 'string' ? req.body.thread_id : null;
  if (!message) return res.status(400).json({ error: 'Message is required' });
  if (message.length > 6000) return res.status(400).json({ error: 'Message is too long (6000 character limit)' });

  const { data: profile } = await client
    .from('profiles')
    .select('org_id')
    .eq('id', userId)
    .single();
  if (!profile?.org_id) return res.status(403).json({ error: 'No SPAS 360 profile is attached to this login' });
  const orgId = profile.org_id as string;

  try {
    let threadId = requestedThreadId;
    if (threadId) {
      const { data: owned } = await client
        .from('agent_threads')
        .select('id')
        .eq('id', threadId)
        .eq('user_id', userId)
        .eq('thread_type', 'agent')
        .maybeSingle();
      if (!owned) return res.status(404).json({ error: 'Thread not found' });
    } else {
      const { data: created, error } = await client
        .from('agent_threads')
        .insert({ org_id: orgId, user_id: userId, thread_type: 'agent', title: compactTitle(message) })
        .select('id')
        .single();
      if (error || !created?.id) throw new Error(error?.message ?? 'Could not create a thread');
      threadId = created.id as string;
    }

    const { data: priorRows } = await client
      .from('agent_messages')
      .select('role, content, created_at')
      .eq('thread_id', threadId)
      .in('role', ['user', 'assistant'])
      .order('created_at', { ascending: false })
      .limit(24);
    const conversation: ApiMessage[] = (priorRows ?? [])
      .reverse()
      .map(row => ({ role: row.role as 'user' | 'assistant', content: row.content as string }));

    const { error: insertError } = await client.from('agent_messages').insert({
      thread_id: threadId,
      role: 'user',
      content: message,
      sender_id: userId,
    });
    if (insertError) throw new Error(insertError.message);
    conversation.push({ role: 'user', content: message });

    const tools = createAgentTools(
      client,
      async () => userId,
      input => queueSmsWith(client, userId, orgId, input),
    );
    const descriptions = getOpenAITools(tools);

    let assistant = await callAri(token, conversation, descriptions);
    let rounds = 0;
    let calls = 0;
    while ((assistant.tool_calls?.length ?? 0) > 0 && rounds < 6) {
      rounds += 1;
      calls += assistant.tool_calls!.length;
      if (calls > 16) throw new Error('Ari requested too many actions in one turn. Split the request into smaller commands.');

      await client.from('agent_messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: assistant.content ?? '',
        tool_calls: assistant.tool_calls,
      });
      conversation.push(assistant);

      for (const toolCall of assistant.tool_calls!) {
        let args: Record<string, string> = {};
        try { args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, string>; } catch { /* tool gets empty args */ }
        const result = await executeToolFrom(tools, toolCall.function.name, args);
        const content = JSON.stringify(result);
        const toolMessage: ApiMessage = { role: 'tool', content, tool_call_id: toolCall.id };
        conversation.push(toolMessage);
        await client.from('agent_messages').insert({
          thread_id: threadId,
          role: 'tool',
          content,
          tool_name: toolCall.function.name,
        });
      }
      assistant = await callAri(token, conversation, descriptions);
    }

    const answer = assistant.content?.trim();
    if (!answer) throw new Error('Ari completed actions but did not return a final answer.');

    const { data: saved, error: savedError } = await client.from('agent_messages').insert({
      thread_id: threadId,
      role: 'assistant',
      content: answer,
    }).select('id, created_at').single();
    if (savedError) throw new Error(savedError.message);

    await Promise.all([
      client.from('agent_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId),
      client.from('agent_deliverables').insert({
        org_id: orgId,
        thread_id: threadId,
        requested_by: userId,
        kind: inferKind(message, answer),
        title: compactTitle(message),
        content: answer,
        content_format: 'markdown',
        delivery_channels: ['citadel', 'agent-os'],
      }),
    ]);

    return res.status(200).json({
      thread_id: threadId,
      message: { id: saved?.id, role: 'assistant', content: answer, created_at: saved?.created_at },
      tool_rounds: rounds,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('agent/run failed', { requestId, userId, requestedThreadId, detail });
    if (/too many actions/i.test(detail)) {
      return res.status(422).json({ error: 'That command is too broad for one run. Split it into smaller commands and try again.', request_id: requestId });
    }
    if (/content policy/i.test(detail)) {
      return res.status(422).json({
        error: 'Ari could not process that exact wording. Rephrase it in plain business terms and try again.',
        request_id: requestId,
      });
    }
    if (/timeout|timed out|abort/i.test(detail)) {
      return res.status(504).json({ error: 'Ari took too long to finish. Review Approvals before retrying the command.', request_id: requestId });
    }
    return res.status(500).json({
      error: 'Ari hit a temporary runtime problem. Your command history is safe; review Approvals before retrying.',
      request_id: requestId,
    });
  }
}
