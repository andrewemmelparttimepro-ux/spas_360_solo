import { supabase } from '@/lib/supabase';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, string>) => Promise<unknown>;
}

/** Resolve the signed-in user's id + org/location — the safe, RLS-correct scope for writes. */
async function currentProfile() {
  const { data: user } = await supabase.auth.getUser();
  const userId = user?.user?.id;
  if (!userId) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, location_id')
    .eq('id', userId)
    .single();
  if (!profile?.org_id) return null;
  return { userId, org_id: profile.org_id as string, location_id: (profile.location_id as string) ?? null };
}

export const agentTools: ToolDefinition[] = [
  {
    name: 'search_contacts',
    description: 'Search for customers by name, phone number, or email. Use this when someone mentions a customer.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Name, phone, or email to search for' },
      },
      required: ['query'],
    },
    execute: async ({ query }) => {
      const { data } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, email, customer_type, lead_source, created_at')
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(5);
      return data ?? [];
    },
  },
  {
    name: 'create_contact',
    description: 'Create a new customer contact. Use when a salesperson mentions a new lead.',
    parameters: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        phone: { type: 'string' },
        email: { type: 'string', description: 'Optional' },
        lead_source: { type: 'string', enum: ['Walk-in', 'Website', 'Referral', 'Ad', 'Phone', 'Event', 'Other'] },
      },
      required: ['first_name', 'last_name', 'phone'],
    },
    execute: async (args) => {
      const { data: user } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user?.user?.id).single();
      if (!profile?.org_id) return { error: 'Could not resolve your organization. Are you signed in?' };
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...args, org_id: profile.org_id, customer_type: 'Lead' })
        .select()
        .single();
      if (error) return { error: error.message };
      return data;
    },
  },
  {
    name: 'get_contact_details',
    description: 'Get full details on a specific contact including their deals, jobs, and recent activity.',
    parameters: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'UUID of the contact' },
      },
      required: ['contact_id'],
    },
    execute: async ({ contact_id }) => {
      const [contactRes, dealsRes, jobsRes, notesRes] = await Promise.all([
        supabase.from('contacts').select('*').eq('id', contact_id).single(),
        supabase.from('deals').select('id, title, amount, priority, created_at, pipeline_stages(name)').eq('contact_id', contact_id),
        supabase.from('jobs').select('id, title, status, job_type, scheduled_at').eq('contact_id', contact_id),
        supabase.from('notes').select('body, created_at').eq('contact_id', contact_id).order('created_at', { ascending: false }).limit(5),
      ]);
      return {
        contact: contactRes.data,
        deals: dealsRes.data ?? [],
        jobs: jobsRes.data ?? [],
        recent_notes: notesRes.data ?? [],
      };
    },
  },
  {
    name: 'search_inventory',
    description: 'Search available inventory by product name, brand, category, or SKU.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Product name, brand, SKU, or category' },
        status: { type: 'string', enum: ['In Stock', 'On Order', 'Sold'], description: 'Filter by status. Default: In Stock' },
      },
      required: ['query'],
    },
    execute: async ({ query, status }) => {
      let q = supabase
        .from('inventory_items')
        .select('id, sku, product, brand, category, model, color_finish, status, msrp, sale_price, locations:location_id(name)')
        .or(`product.ilike.%${query}%,brand.ilike.%${query}%,sku.ilike.%${query}%,category.ilike.%${query}%`);
      if (status) q = q.eq('status', status);
      const { data } = await q.limit(10);
      return data ?? [];
    },
  },
  {
    name: 'create_note',
    description: 'Add a note to a contact, deal, or job. Use after customer interactions.',
    parameters: {
      type: 'object',
      properties: {
        body: { type: 'string', description: 'The note content' },
        contact_id: { type: 'string', description: 'Optional contact UUID' },
        deal_id: { type: 'string', description: 'Optional deal UUID' },
        job_id: { type: 'string', description: 'Optional job UUID' },
      },
      required: ['body'],
    },
    execute: async (args) => {
      const { data: user } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('notes')
        .insert({ ...args, created_by: user?.user?.id })
        .select()
        .single();
      if (error) return { error: error.message };
      return { success: true, id: data?.id };
    },
  },
  {
    name: 'create_task',
    description: 'Create a follow-up task or reminder. Use when scheduling follow-ups.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
        priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
        contact_id: { type: 'string', description: 'Optional contact UUID' },
        deal_id: { type: 'string', description: 'Optional deal UUID' },
      },
      required: ['title', 'due_date'],
    },
    execute: async (args) => {
      const { data: user } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from('profiles').select('org_id').eq('id', user?.user?.id).single();
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          title: args.title,
          due_at: `${args.due_date}T09:00:00`,
          priority: args.priority || 'Medium',
          status: 'Pending',
          contact_id: args.contact_id || null,
          deal_id: args.deal_id || null,
          org_id: profile?.org_id,
          assigned_to: user?.user?.id,
          created_by: user?.user?.id,
        })
        .select()
        .single();
      if (error) return { error: error.message };
      return { success: true, id: data?.id };
    },
  },
  {
    name: 'get_pipeline_summary',
    description: 'Get a summary of the current sales pipeline — deal counts and values by stage.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const { data: deals } = await supabase
        .from('deals')
        .select('amount, pipeline_stages(name, probability)');
      if (!deals) return { total_deals: 0, stages: [] };

      const stageMap: Record<string, { count: number; value: number }> = {};
      for (const d of deals) {
        const stage = (d as Record<string, unknown>).pipeline_stages as { name: string } | null;
        const name = stage?.name ?? 'Unknown';
        if (!stageMap[name]) stageMap[name] = { count: 0, value: 0 };
        stageMap[name].count++;
        stageMap[name].value += Number((d as Record<string, unknown>).amount) || 0;
      }
      return {
        total_deals: deals.length,
        total_pipeline_value: deals.reduce((s, d) => s + (Number((d as Record<string, unknown>).amount) || 0), 0),
        stages: Object.entries(stageMap).map(([name, data]) => ({ stage: name, ...data })),
      };
    },
  },
  {
    name: 'get_todays_jobs',
    description: 'Get all jobs scheduled for today.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('jobs')
        .select('id, title, status, job_type, scheduled_at, contacts:contact_id(first_name, last_name)')
        .gte('scheduled_at', `${today}T00:00:00`)
        .lte('scheduled_at', `${today}T23:59:59`)
        .order('scheduled_at');
      return data ?? [];
    },
  },
  {
    name: 'draft_followup_message',
    description: 'Generate a personalized follow-up text message for a customer. Returns a draft for the salesperson to review.',
    parameters: {
      type: 'object',
      properties: {
        customer_name: { type: 'string' },
        context: { type: 'string', description: 'What happened — e.g. "visited showroom, interested in Bullfrog A7L"' },
        tone: { type: 'string', enum: ['warm', 'professional', 'urgent'], description: 'Message tone' },
      },
      required: ['customer_name', 'context'],
    },
    execute: async ({ customer_name, context, tone }) => {
      // This tool just returns the context — the LLM itself generates the message
      return { customer_name, context, tone: tone || 'warm', instruction: 'Generate a short, personalized follow-up SMS based on this context.' };
    },
  },
  {
    name: 'list_open_deals',
    description: 'List open (not closed) deals with stage, customer, amount, and days idle. Use when the user asks about "my deals", the board, or what\'s working.',
    parameters: {
      type: 'object',
      properties: {
        mine_only: { type: 'string', enum: ['true', 'false'], description: 'true = only deals assigned to the current user. Default false (whole store).' },
      },
    },
    execute: async ({ mine_only }) => {
      const me = await currentProfile();
      if (!me) return { error: 'Could not resolve your account.' };
      let q = supabase
        .from('deals')
        .select('id, title, amount, priority, updated_at, expected_close_date, pipeline_stages(name), contacts:contact_id(first_name, last_name), assigned:assigned_to(first_name, last_name)')
        .eq('org_id', me.org_id)
        .order('updated_at', { ascending: false })
        .limit(25);
      if (mine_only === 'true') q = q.eq('assigned_to', me.userId);
      const { data } = await q;
      const now = Date.now();
      return (data ?? [])
        .filter((d: Record<string, unknown>) => {
          const stage = d.pipeline_stages as { name: string } | null;
          return stage && !stage.name.startsWith('Closed');
        })
        .map((d: Record<string, unknown>) => {
          const stage = d.pipeline_stages as { name: string } | null;
          const c = d.contacts as { first_name: string; last_name: string } | null;
          const a = d.assigned as { first_name: string; last_name: string } | null;
          return {
            title: d.title,
            stage: stage?.name,
            customer: c ? `${c.first_name} ${c.last_name}` : null,
            amount: d.amount,
            priority: d.priority,
            salesperson: a ? `${a.first_name} ${a.last_name}` : null,
            days_idle: Math.floor((now - new Date(d.updated_at as string).getTime()) / 86400000),
            expected_close: d.expected_close_date,
          };
        });
    },
  },
  {
    name: 'get_deal_details',
    description: 'Pull one deal with its full context: stage, customer contact info, notes history, and open tasks. Search by deal title or customer name (e.g. "Wyant").',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Deal title fragment or customer first/last name' },
      },
      required: ['query'],
    },
    execute: async ({ query }) => {
      const me = await currentProfile();
      if (!me) return { error: 'Could not resolve your account.' };
      // Try deal title, then customer name
      let { data: deals } = await supabase
        .from('deals')
        .select('id, title, amount, priority, lead_source, product_interest, expected_close_date, updated_at, contact_id, pipeline_stages(name), contacts:contact_id(first_name, last_name, phone, email), assigned:assigned_to(first_name, last_name)')
        .eq('org_id', me.org_id)
        .ilike('title', `%${query}%`)
        .limit(3);
      if (!deals || deals.length === 0) {
        const { data: byContact } = await supabase
          .from('contacts')
          .select('id')
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
          .limit(3);
        const ids = (byContact ?? []).map(c => c.id);
        if (ids.length > 0) {
          const res = await supabase
            .from('deals')
            .select('id, title, amount, priority, lead_source, product_interest, expected_close_date, updated_at, contact_id, pipeline_stages(name), contacts:contact_id(first_name, last_name, phone, email), assigned:assigned_to(first_name, last_name)')
            .eq('org_id', me.org_id)
            .in('contact_id', ids)
            .limit(3);
          deals = res.data;
        }
      }
      if (!deals || deals.length === 0) return { found: false, message: `No deal matching "${query}"` };
      const deal = deals[0] as Record<string, unknown>;
      const [notesRes, tasksRes] = await Promise.all([
        supabase.from('notes').select('body, created_at').eq('deal_id', deal.id as string).order('created_at', { ascending: false }).limit(6),
        supabase.from('tasks').select('title, due_at, status').eq('deal_id', deal.id as string).in('status', ['Pending', 'In Progress']).order('due_at').limit(5),
      ]);
      return {
        found: true,
        other_matches: deals.length > 1 ? deals.slice(1).map((d: Record<string, unknown>) => d.title) : [],
        deal: {
          title: deal.title,
          stage: (deal.pipeline_stages as { name: string } | null)?.name,
          amount: deal.amount,
          priority: deal.priority,
          lead_source: deal.lead_source,
          interests: deal.product_interest,
          expected_close: deal.expected_close_date,
          salesperson: (() => { const a = deal.assigned as { first_name: string; last_name: string } | null; return a ? `${a.first_name} ${a.last_name}` : null; })(),
          customer: deal.contacts,
          days_idle: Math.floor((Date.now() - new Date(deal.updated_at as string).getTime()) / 86400000),
        },
        recent_notes: notesRes.data ?? [],
        open_tasks: tasksRes.data ?? [],
      };
    },
  },
  {
    name: 'create_deal',
    description: 'Create a new sales deal/opportunity for an existing contact. The deal starts in the first pipeline stage. Always confirm the contact and amount with the user before calling.',
    parameters: {
      type: 'object',
      properties: {
        contact_id: { type: 'string', description: 'UUID of the contact this deal belongs to' },
        title: { type: 'string', description: 'Short deal title, e.g. "Bullfrog A7L + cover"' },
        amount: { type: 'string', description: 'Deal value in dollars, numbers only' },
        priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
        lead_source: { type: 'string', enum: ['Walk-in', 'Website', 'Referral', 'Ad', 'Phone', 'Event', 'Other'] },
        expected_close_date: { type: 'string', description: 'Optional YYYY-MM-DD' },
      },
      required: ['contact_id', 'title'],
    },
    execute: async (args) => {
      const me = await currentProfile();
      if (!me) return { error: 'Could not resolve your organization. Are you signed in?' };
      // Deal must start in a real stage — use the org's first stage by position.
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('org_id', me.org_id)
        .order('position')
        .limit(1)
        .single();
      if (!stage?.id) return { error: 'No pipeline stages configured for this organization.' };
      const { data, error } = await supabase
        .from('deals')
        .insert({
          org_id: me.org_id,
          contact_id: args.contact_id,
          stage_id: stage.id,
          title: args.title,
          amount: args.amount ? Number(args.amount) : null,
          priority: args.priority || 'Medium',
          lead_source: args.lead_source || 'Walk-in',
          expected_close_date: args.expected_close_date || null,
          assigned_to: me.userId,
          location_id: me.location_id,
        })
        .select('id, title, amount')
        .single();
      if (error) return { error: error.message };
      return { success: true, deal: data };
    },
  },
  {
    name: 'update_deal_stage',
    description: 'Move a deal to a different pipeline stage (e.g. "Closed - Won", "Negotiation"). Confirm with the user before moving a deal to a closed stage.',
    parameters: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', description: 'UUID of the deal to move' },
        stage_name: { type: 'string', description: 'Target stage name, e.g. "Negotiation" or "Closed - Won"' },
      },
      required: ['deal_id', 'stage_name'],
    },
    execute: async ({ deal_id, stage_name }) => {
      // Resolve org from the deal itself so we match the right org's stages.
      const { data: deal } = await supabase.from('deals').select('org_id').eq('id', deal_id).single();
      if (!deal?.org_id) return { error: 'Deal not found.' };
      const { data: stage } = await supabase
        .from('pipeline_stages')
        .select('id, name')
        .eq('org_id', deal.org_id)
        .ilike('name', stage_name)
        .limit(1)
        .single();
      if (!stage?.id) return { error: `No stage named "${stage_name}" found. Use the exact stage name.` };
      const { error } = await supabase
        .from('deals')
        .update({ stage_id: stage.id, updated_at: new Date().toISOString() })
        .eq('id', deal_id);
      if (error) return { error: error.message };
      return { success: true, moved_to: stage.name };
    },
  },
  {
    name: 'get_overdue_tasks',
    description: 'Get the current user\'s tasks that are overdue or pending and past due. Use when the user asks what they owe or what is falling behind.',
    parameters: { type: 'object', properties: {} },
    execute: async () => {
      const me = await currentProfile();
      if (!me) return { error: 'Could not resolve your account.' };
      const nowIso = new Date().toISOString();
      const { data } = await supabase
        .from('tasks')
        .select('id, title, due_at, priority, status, contact_id, deal_id')
        .eq('assigned_to', me.userId)
        .in('status', ['Pending', 'Overdue'])
        .lt('due_at', nowIso)
        .order('due_at');
      return data ?? [];
    },
  },
  {
    name: 'schedule_job',
    description: 'Schedule (or reschedule) an existing service/delivery job by setting its date/time. Confirm the job and time with the user first.',
    parameters: {
      type: 'object',
      properties: {
        job_id: { type: 'string', description: 'UUID of the job to schedule' },
        scheduled_at: { type: 'string', description: 'ISO datetime or YYYY-MM-DD (defaults to 9:00 AM if no time given)' },
      },
      required: ['job_id', 'scheduled_at'],
    },
    execute: async ({ job_id, scheduled_at }) => {
      const when = scheduled_at.includes('T') ? scheduled_at : `${scheduled_at}T09:00:00`;
      const { data, error } = await supabase
        .from('jobs')
        .update({ scheduled_at: when, updated_at: new Date().toISOString() })
        .eq('id', job_id)
        .select('id, title, scheduled_at')
        .single();
      if (error) return { error: error.message };
      return { success: true, job: data };
    },
  },
];

// Convert to OpenAI function format
export function getOpenAITools() {
  return agentTools.map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

// Execute a tool by name
export async function executeTool(name: string, args: Record<string, string>) {
  const tool = agentTools.find(t => t.name === name);
  if (!tool) return { error: `Unknown tool: ${name}` };
  try {
    return await tool.execute(args);
  } catch (err) {
    return { error: `Tool ${name} failed: ${(err as Error).message}` };
  }
}
