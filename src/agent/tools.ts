import { supabase } from '@/lib/supabase';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, string>) => Promise<unknown>;
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
      const { data: profile } = await supabase.from('profiles').select('org_id').limit(1).single();
      const { data, error } = await supabase
        .from('contacts')
        .insert({ ...args, org_id: profile?.org_id, customer_type: 'Lead' })
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
