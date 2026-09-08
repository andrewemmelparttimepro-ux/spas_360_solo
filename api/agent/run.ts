import { textDeliverableState } from '../_lib/deliverableState.js';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AgentOperation } from '../_lib/agentOperation.js';
import { createHash, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  createAgentTools,
  executeToolFrom,
  getOpenAITools,
  type AgentToolQueueSms,
} from '../../src/agent/toolFactory.js';
import {
  artifactInstruction,
  detectArtifactIntent,
  loadArtifactContext,
  renderSalesPdf,
  type MissingField,
} from '../_lib/artifacts.js';

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
const SUPABASE_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const CHAT_ORIGIN = (process.env.AGENT_API_BASE_URL || 'https://spas360solo.vercel.app').replace(/\/$/, '');

function bearer(req: VercelRequest): string | null {
  const raw = Array.isArray(req.headers.authorization)
    ? req.headers.authorization[0]
    : req.headers.authorization;
  const match = raw?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function clientFor(token: string, channel: string = 'web', operationId?: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}`, 'x-spas-client': channel, ...(operationId ? {'x-spas-operation':operationId} : {}) } },
  });
}

function serviceClient(): SupabaseClient {
  if (!SUPABASE_SERVICE) throw new Error('Artifact storage is not configured');
  return createClient(SUPABASE_URL, SUPABASE_SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function blockedArtifactMessage(missing: MissingField[]): string {
  const list = missing.map(item => `• ${item.field}: ${item.reason}`).join('\n');
  return `I stopped this before making a customer-facing file because the source data is incomplete.\n\n${list}\n\nThe blocked draft is saved in Citadel. Fill those fields, then ask me to rebuild it.`;
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
      status: 'draft',
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
    throw new Error(error?.message ?? 'Could not queue the text. Its draft remains available for reconciliation.');
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

  const suppliedOperation = req.body?.operation_id;
  if (suppliedOperation !== undefined && (typeof suppliedOperation !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(suppliedOperation))) return res.status(400).json({error:'Invalid command identity'});
  const operationId = suppliedOperation || randomUUID();
  const channel = ['native','sms'].includes(req.body?.client_channel) ? req.body.client_channel : 'web';
  const rawClient = clientFor(token, channel, operationId);
  let client = rawClient;
  let operation: AgentOperation | undefined;
  let actualThreadId: string | null = null;
  res.setHeader('X-Operation-ID', operationId);
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
  const artifactIntent = detectArtifactIntent(message);

  try {
    const digest=createHash('sha256').update(JSON.stringify({message,thread_id:requestedThreadId})).digest('hex');
    const {data:claim,error:claimError}=await rawClient.rpc('claim_agent_operation',{p_id:operationId,p_hash:digest,p_runner:requestId,p_channel:channel,p_message:message,p_thread:requestedThreadId});
    if(claimError) throw new Error(claimError.message);
    if(claim.status==='complete') return res.status(200).json({...claim.response,operation_id:operationId,replayed:true});
    if(claim.status==='running') return res.status(409).json({error:'This command is still running. Wait before retrying this same command.',operation_id:operationId,retry_after_seconds:claim.retry_after_seconds});
    operation=new AgentOperation(rawClient,operationId,requestId,claim.steps??{},claim.created_at);
    client=operation.client('setup');
    let threadId = requestedThreadId;
    if (threadId) {
      const { data: owned } = await client
        .from('agent_threads')
        .select('id')
        .eq('id', threadId)
        .eq('user_id', userId)
        .eq('thread_type', 'agent')
        .maybeSingle();
      if (!owned) throw new Error('Thread not found');
    } else {
      const { data: created, error } = await client
        .from('agent_threads')
        .insert({ org_id: orgId, user_id: userId, thread_type: 'agent', title: compactTitle(message) })
        .select('id')
        .single();
      if (error || !created?.id) throw new Error(error?.message ?? 'Could not create a thread');
      threadId = created.id as string;
    }

    actualThreadId = threadId;
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
    conversation.push({
      role: 'user',
      content: artifactIntent ? `${message}${artifactInstruction()}` : message,
    });

    const tools = createAgentTools(
      client,
      async () => userId,
      input => queueSmsWith(client, userId, orgId, input),
    );
    const descriptions = getOpenAITools(tools);

    let assistant = await operation.saved('model:0',()=>callAri(token, conversation, descriptions));
    let rounds = 0;
    let calls = 0;
    while ((assistant.tool_calls?.length ?? 0) > 0 && rounds < 6) {
      rounds += 1;
      calls += assistant.tool_calls!.length;
      if (calls > 16) throw new Error('Ari requested too many actions in one turn. Split the request into smaller commands.');

      await operation.client(`round-log:${rounds}`).from('agent_messages').insert({
        thread_id: threadId,
        role: 'assistant',
        content: assistant.content ?? '',
        tool_calls: assistant.tool_calls,
      });
      conversation.push(assistant);

      for (const [toolIndex, toolCall] of assistant.tool_calls!.entries()) {
        let args: Record<string, string> = {};
        try { args = JSON.parse(toolCall.function.arguments || '{}') as Record<string, string>; } catch { /* tool gets empty args */ }
        const toolScope=`tool:${rounds}:${toolIndex}`;
        const toolClient=operation.client(toolScope);
        const scopedTools=createAgentTools(toolClient,async()=>userId,input=>queueSmsWith(toolClient,userId,orgId,input));
        const result = await operation.saved(`result:${toolScope}`,()=>executeToolFrom(scopedTools, toolCall.function.name, args, {throwErrors:true}));
        const content = JSON.stringify(result);
        const toolMessage: ApiMessage = { role: 'tool', content, tool_call_id: toolCall.id };
        conversation.push(toolMessage);
        await operation.client(`tool-log:${rounds}:${toolIndex}`).from('agent_messages').insert({
          thread_id: threadId,
          role: 'tool',
          content,
          tool_name: toolCall.function.name,
        });
      }
      assistant = await operation.saved(`model:${rounds}`,()=>callAri(token, conversation, descriptions));
    }

    const answer = assistant.content?.trim();
    if (!answer) throw new Error('Ari completed actions but did not return a final answer.');

    let responseContent = answer;
    let artifact: Record<string, unknown> | null = null;

    client=operation.client('artifact');
    if (artifactIntent) {
      const context = await loadArtifactContext(client, orgId, message, answer);
      const blocked = context.missing.length > 0;
      const { data: deliverable, error: deliverableError } = await client
        .from('agent_deliverables')
        .insert({
          org_id: orgId,
          thread_id: threadId,
          requested_by: userId,
          kind: artifactIntent.kind,
          title: artifactIntent.title,
          content: answer,
          content_format: 'markdown',
          artifact_format: artifactIntent.format,
          status: blocked ? 'blocked' : 'rendering',
          missing_fields: context.missing,
          source_snapshot: {
            request: message,
            inventory_id: context.inventory?.id ?? null,
            inventory_sku: context.inventory?.sku ?? null,
            business_name: context.profile?.business_name ?? null,
          },
          delivery_channels: ['citadel', 'agent-os', 'native-share'],
        })
        .select('id, title, kind, status, artifact_format, file_name, mime_type, missing_fields, created_at')
        .single();
      if (deliverableError || !deliverable?.id) {
        throw new Error(deliverableError?.message ?? 'Could not create the artifact record');
      }

      if (blocked) {
        responseContent = blockedArtifactMessage(context.missing);
        artifact = deliverable as Record<string, unknown>;
      } else {
        try {
          const service = serviceClient();
          const rendered = await renderSalesPdf(service, artifactIntent, answer, context);
          const storagePath = `${orgId}/${deliverable.id}/v1/${rendered.fileName}`;
          const { error: uploadError } = await service.storage
            .from('ari-deliverables')
            .upload(storagePath, rendered.bytes, {
              contentType: 'application/pdf',
              cacheControl: '3600',
              upsert: false,
            });
          let storedSize=rendered.bytes.byteLength;
          if (uploadError) {
            // A previous attempt may have uploaded the deterministic path before
            // losing its reply. Reuse that file; never overwrite a saved artifact.
            const existing=await service.storage.from('ari-deliverables').download(storagePath);
            if(existing.error || !existing.data) throw new Error(uploadError.message);
            storedSize=existing.data.size;
          }

          const { data: ready, error: readyError } = await client
            .from('agent_deliverables')
            .update({
              status: 'ready',
              storage_bucket: 'ari-deliverables',
              storage_path: storagePath,
              mime_type: 'application/pdf',
              file_name: rendered.fileName,
              file_size_bytes: storedSize,
              missing_fields: [],
              updated_at: new Date().toISOString(),
            })
            .eq('id', deliverable.id)
            .select('id, title, kind, status, artifact_format, file_name, mime_type, file_size_bytes, missing_fields, created_at')
            .single();
          if (readyError || !ready) throw new Error(readyError?.message ?? 'Could not finalize the artifact');
          artifact = ready as Record<string, unknown>;
          responseContent = `Your PDF is ready and saved in Citadel. Preview, download, or share it from the artifact card below.`;
        } catch (artifactError) {
          // Do not turn an ambiguous ready-write response into a failed record.
          // The same command resumes the deterministic upload and write receipt.
          throw artifactError;
        }
      }
    } else if (textDeliverableState(message, answer)) {
      const textState = textDeliverableState(message, answer)!;
      const { data: textDraft, error: archiveError } = await client.from('agent_deliverables').insert({
        org_id: orgId,
        thread_id: threadId,
        requested_by: userId,
        kind: textState.kind,
        status: textState.status,
        source_snapshot: { request: message, outcome: textState.status },
        title: compactTitle(message),
        content: answer,
        content_format: 'markdown',
        delivery_channels: ['citadel', 'agent-os'],
      }).select('id, title, kind, status, artifact_format, file_name, mime_type, file_size_bytes, missing_fields, created_at').single();
      if (textDraft) artifact = textDraft;
      if (archiveError) throw new Error(archiveError.message);
    }

    client=operation.client('final');
    const { data: saved, error: savedError } = await client.from('agent_messages').insert({
      thread_id: threadId,
      role: 'assistant',
      content: responseContent,
      deliverable_id: artifact?.id ?? null,
    }).select('id, created_at, deliverable_id').single();
    if (savedError) throw new Error(savedError.message);

    await client.from('agent_threads').update({ last_message_at: new Date().toISOString() }).eq('id', threadId);

    const response = {
      operation_id:operationId,
      thread_id: threadId,
      message: {
        id: saved?.id,
        role: 'assistant',
        content: responseContent,
        created_at: saved?.created_at,
        deliverable_id: saved?.deliverable_id,
      },
      artifact,
      tool_rounds: rounds,
    };
    await operation.checkpoint('__response',response);
    return res.status(200).json(response);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error('agent/run failed', { requestId, userId, requestedThreadId, detail });
    if(operation) await operation.checkpoint('__error',detail).catch(()=>undefined);
    const {data:receipts}=operation?await rawClient.from('agent_write_receipts').select('step,input,result').eq('operation_id',operationId).limit(80):{data:[]};
    const completedActions=(receipts??[]).filter(row=>!String(row.input?.table??'').startsWith('agent_')).map(row=>({
      step:row.step, table:row.input?.table??'contacts',
      record_ids:Array.isArray(row.result)?row.result.map((item:Record<string,unknown>)=>item.id).filter(Boolean):[],
    }));
    const message=/too many actions/i.test(detail)?'This command needs fewer actions. Review the saved results before starting a smaller command.':
      /content policy/i.test(detail)?'Ari could not process that wording. Review saved results before starting a rephrased command.':
      'Ari could not finish this command. Retry this same operation to continue from its saved steps. Saved changes will not be repeated.';
    return res.status(/timeout|timed out|abort/i.test(detail)?504:500).json({
      error:message,request_id:requestId,operation_id:operationId,thread_id:actualThreadId,
      completed_actions:completedActions,
    });
  }
}
