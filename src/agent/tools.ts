import { supabase } from '@/lib/supabase';
import { queueSmsForApproval } from '@/agent/smsOutbox';
import {
  createAgentTools,
  executeToolFrom,
  getOpenAITools as describeTools,
  type ToolDefinition,
} from '@/agent/toolFactory';

export type { AgentToolQueueSms, ToolDefinition } from '@/agent/toolFactory';

const browserUserId = async () => {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
};

/** Browser runtime. The same catalogue is instantiated request-by-request by /api/agent/run. */
export const agentTools: ToolDefinition[] = createAgentTools(
  supabase,
  browserUserId,
  queueSmsForApproval,
);

export function getOpenAITools() {
  return describeTools(agentTools);
}

export async function executeTool(name: string, args: Record<string, string>) {
  return executeToolFrom(agentTools, name, args);
}
