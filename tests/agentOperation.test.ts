import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {SupabaseClient} from '@supabase/supabase-js';
import {AgentOperation} from '../api/_lib/agentOperation.ts';
import {createAgentTools,executeToolFrom} from '../src/agent/toolFactory.ts';
import {readPendingCommand,storePendingCommand} from '../src/lib/pendingCommand.ts';

function harness() {
 const saved:Record<string,unknown>={};const receipts=new Map<string,unknown>();const effects:unknown[]=[];let loseReply=true;let reads=0;
 const me={id:'actor',org_id:'tenant',location_id:null,first_name:'Staff',last_name:'Member',email:'staff@example.test'};
 const base={
  from(table:string) {
   let single=false;
   const q={select(){return q;},eq(){return q;},single(){single=true;return q;},then(resolve:(v:unknown)=>unknown){reads++;return Promise.resolve({data:single?me:[me],error:null}).then(resolve);}};
   return q;
  },
  async rpc(name:string,args:Record<string,unknown>) {
   if(name==='checkpoint_agent_operation'){saved[args.p_key as string]=structuredClone(args.p_value);return{data:null,error:null};}
   if(name==='agent_write_once') {
    const key=args.p_step as string;
    if(!receipts.has(key)){const row={id:`effect-${effects.length}`,...(args.p_values as object)};effects.push(row);receipts.set(key,[row]);if(loseReply){loseReply=false;throw Error('Response interrupted after commit');}}
    return {data:receipts.get(key),error:null};
   }
   throw Error(`Unexpected RPC ${name}`);
  },
 } as unknown as SupabaseClient;
 return {base,saved,effects,reads:()=>reads,operation:()=>new AgentOperation(base,'operation','runner',structuredClone(saved),'2026-09-08T17:00:00Z')};
}
test('shared runtime: lost task reply reuses receipt and original plan on retry',async()=>{
 const h=harness();const args={assignee_name:'me',task:'Prepare the customer pickup paperwork'};
 const run=async()=>{
  const op=h.operation();
  const plan=await op.saved('model:0',async()=>args);
  const client=op.client('tool:1:0');const tools=createAgentTools(client,async()=>'actor',async()=>({error:'Unexpected SMS'}));
  return op.saved('result:tool:1:0',()=>executeToolFrom(tools,'delegate_task',plan,{throwErrors:true}));
 };
 await assert.rejects(run(),/Response interrupted/);
 assert.equal(h.effects.length,1);const firstReads=h.reads();
 const result=await run() as {task_id:string};assert.equal(result.task_id,'effect-0');assert.equal(h.effects.length,1);assert.equal(h.reads(),firstReads);
 assert.deepEqual(await run(),result);assert.equal(h.effects.length,1);
});
test('unsupported filters fail before a database mutation',async()=>{
 const h=harness();await assert.rejects(async()=>h.operation().client('tool').from('jobs').update({status:'Completed'}).eq('org_id','tenant'),/Unsupported command update filter/);assert.equal(h.effects.length,0);
});
test('completed model steps are not rerun',async()=>{
 const h=harness();let calls=0;const fn=async()=>({calls:++calls});
 assert.deepEqual(await h.operation().saved('model:0',fn),{calls:1});
 assert.deepEqual(await h.operation().saved('model:0',fn),{calls:1});assert.equal(calls,1);
});
test('pending identity survives remount and stays isolated by signed-in user',()=>{
 const rows=new Map<string,string>();const storage={getItem:(k:string)=>rows.get(k)??null,setItem:(k:string,v:string)=>{rows.set(k,v);},removeItem:(k:string)=>{rows.delete(k);}};
 const pending={id:'10000000-0000-4000-8000-000000000001',userId:'staff-a',content:'Prepare pickup paperwork',threadId:null,createdAt:1000};
 storePendingCommand(storage,'staff-a',pending);assert.deepEqual(readPendingCommand(storage,'staff-a',2000),pending);assert.equal(readPendingCommand(storage,'staff-b',2000),null);
 assert.equal(readPendingCommand(storage,'staff-a',8*86400000),null);
 storePendingCommand(storage,'staff-a',null);assert.equal(readPendingCommand(storage,'staff-a',2000),null);
});
