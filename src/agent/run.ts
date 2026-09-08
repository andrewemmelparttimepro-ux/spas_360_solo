import { supabase } from '@/lib/supabase';
import type { CitadelArchiveInput } from '@/agent/citadel';

/** Mentions share the server's transactional tool receipts and resumable reply.
 * Only unfinished identical requests reuse an ID. Completed intentional repeats
 * get a new ID. The server persists the final note/message with its receipt.
 */
const pendingMemory=new Map<string,{id:string;at:number}>();
export async function runAgentTask(userContent:string,context:Omit<CitadelArchiveInput,'content'>={}):Promise<string>{
  const {data,error}=await supabase.auth.getSession();
  const session=data.session;
  if(error||!session)throw new Error('Sign in again before asking Ari.');
  const source=context.dealId?{kind:'deal',id:context.dealId}:context.customerId?{kind:'contact',id:context.customerId}:context.threadId?{kind:'team',id:context.threadId}:null;
  const request=JSON.stringify({message:userContent,source});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(request))),b=>b.toString(16).padStart(2,'0')).join('');
  const key=`spas:pending-mention:${session.user.id}:${digest}`;
  let pending=pendingMemory.get(key);
  try{pending??=JSON.parse(sessionStorage.getItem(key)||'null');}catch{/* keep in-memory recovery */}
  if(!pending||!Number.isFinite(pending.at)||Date.now()-pending.at>7*86400000||Date.now()<pending.at||!/^[-0-9a-f]{36}$/i.test(pending.id))pending={id:crypto.randomUUID(),at:Date.now()};
  pendingMemory.set(key,pending);
  try{sessionStorage.setItem(key,JSON.stringify(pending));}catch{/* storage optional */}
  const response=await fetch('/api/agent/run',{
    method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
    body:JSON.stringify({message:userContent,source,operation_id:pending.id,client_channel:'web'}),signal:AbortSignal.timeout(125000),
  });
  const result=await response.json().catch(()=>null);
  if(!response.ok||!result?.message?.content)throw new Error(`Unfinished Ari request. Repeat the same request to resume saved work. Operation ${pending.id}`);
  pendingMemory.delete(key);try{sessionStorage.removeItem(key);}catch{/* optional */}
  return result.message.content;
}

/** Provider errors → one human line (never raw JSON in the UI). */
export function friendlyAgentError(raw: string): string {
  if (/Unfinished Ari request/.test(raw)) return 'Ari has unfinished work. Repeat the same request here to resume its saved steps without repeating saved actions.';
  if (/429|rate.?limit|quota|retryDelay/i.test(raw)) return "Ari is being rate-limited — give it ~30 seconds and try again.";
  if (/401|403|api.?key|unauthorized/i.test(raw)) return "Ari's AI connection isn't authorized — tell a manager to check the API key setup.";
  if (/timeout|timed out|network|fetch/i.test(raw)) return "Connection interrupted. Repeat the same request here to resume its saved steps.";
  return "Ari hit a snag on that one — give it another shot in a moment.";
}
