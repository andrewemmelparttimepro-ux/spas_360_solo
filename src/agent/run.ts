import { supabase } from '@/lib/supabase';
import { getOpenAITools, executeTool } from '@/agent/tools';

// Headless Ari: same /api/chat proxy + client-side tool loop as the chat
// widget, but with no thread persistence — used by @Ari mentions in notes and
// team chat, where the result lands in that surface instead of a conversation.

interface ApiMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { id: string; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

export async function runAgentTask(userContent: string): Promise<string> {
  const session = await supabase.auth.getSession();
  const token = session.data.session?.access_token;

  let conversation: ApiMessage[] = [{ role: 'user', content: userContent }];

  const call = async (): Promise<ApiMessage | undefined> => {
    const r = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ messages: conversation, tools: getOpenAITools() }),
    });
    if (!r.ok) throw new Error(await r.text());
    return (await r.json()).choices?.[0]?.message;
  };

  let msg = await call();
  let guard = 0;
  while ((msg?.tool_calls?.length ?? 0) > 0 && guard < 5) {
    guard++;
    const results: ApiMessage[] = [];
    for (const tc of msg!.tool_calls!) {
      const args = JSON.parse(tc.function.arguments || '{}');
      const result = await executeTool(tc.function.name, args);
      results.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result) });
    }
    conversation = [...conversation, msg!, ...results];
    msg = await call();
  }

  if (msg?.content) return msg.content;
  throw new Error('Ari went through several steps but could not wrap that up cleanly.');
}

/** Provider errors → one human line (never raw JSON in the UI). */
export function friendlyAgentError(raw: string): string {
  if (/429|rate.?limit|quota|retryDelay/i.test(raw)) return "Ari is being rate-limited — give it ~30 seconds and try again.";
  if (/401|403|api.?key|unauthorized/i.test(raw)) return "Ari's AI connection isn't authorized — tell a manager to check the API key setup.";
  if (/timeout|timed out|network|fetch/i.test(raw)) return "Connection hiccup reaching Ari — try that once more.";
  return "Ari hit a snag on that one — give it another shot in a moment.";
}
