import {useState,useEffect,useCallback,useRef} from 'react';
import {supabase} from '@/lib/supabase';
import {useAuth} from '@/contexts/AuthContext';
import type {Task} from '@/types/database';
import type {TablesInsert} from '@/types/supabase.generated';

type PendingTask={id:string;payload:TablesInsert<'tasks'>};
export function useTasks(filters?:{dealId?:string;contactId?:string;jobId?:string},enabled=true){
 const {profile}=useAuth();const [tasks,setTasks]=useState<Task[]>([]);const [isLoading,L]=useState(true);const [error,E]=useState<string|null>(null);
 const sequence=useRef(0);const loaded=useRef(false);const account=useRef(profile?.id);account.current=profile?.id;
 const pending=useRef(new Map<string,PendingTask>());const running=useRef(new Set<string>());
 const scope=`${profile?.id}:${filters?.dealId}:${filters?.contactId}:${filters?.jobId}:${enabled}`;
 const currentScope=useRef(scope);currentScope.current=scope;
 const fetchTasks=useCallback(async()=>{
  if(!profile||!enabled||scope!==currentScope.current)return;
  const request=++sequence.current;if(!loaded.current)L(true);
  try{
   let query=supabase.from('tasks').select('*').order('due_at',{ascending:true});
   if(filters?.dealId)query=query.eq('deal_id',filters.dealId);
   if(filters?.contactId)query=query.eq('contact_id',filters.contactId);
   if(filters?.jobId)query=query.eq('job_id',filters.jobId);
   const {data,error}=await query.abortSignal(AbortSignal.timeout(15000));
   if(request!==sequence.current||scope!==currentScope.current)return;
   if(error)throw error;
   setTasks((data??[]) as Task[]);loaded.current=true;E(null);
  }catch{if(request===sequence.current&&scope===currentScope.current)E('Tasks could not refresh. Previously loaded tasks remain visible. Retry loading.');}
  finally{if(request===sequence.current)L(false);}
 },[profile?.id,enabled,scope]);
 useEffect(()=>{loaded.current=false;setTasks([]);E(null);L(!!profile&&enabled);void fetchTasks();return()=>{sequence.current++;};},[fetchTasks]);

 const createTask=useCallback(async(task:Partial<Task>,options?:{relativeDue?:boolean})=>{
  if(!profile||!task.title?.trim())return null;
  const payload:TablesInsert<'tasks'>={title:task.title.trim(),org_id:profile.org_id,created_by:profile.id,assigned_to:task.assigned_to??profile.id,description:task.description??null,contact_id:task.contact_id??null,deal_id:task.deal_id??null,job_id:task.job_id??null,due_at:task.due_at??null,priority:task.priority??'Medium',status:task.status??'Pending',task_type:task.task_type??null};
  // Relative "tomorrow" buttons freeze the original due time across retries.
  // An explicit date picker remains part of the intent identity.
  const identity=JSON.stringify({...payload,...(options?.relativeDue?{due_at:'relative'}:{})});
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity))),b=>b.toString(16).padStart(2,'0')).join('');
  const key=`spas:pending-task:${profile.id}:${digest}`;
  if(running.current.has(key))return null;running.current.add(key);
  try{
   let prior=pending.current.get(key);
   if(!prior)try{const stored=JSON.parse(sessionStorage.getItem(key)??'null') as PendingTask|null;if(stored&&/^[-0-9a-f]{36}$/i.test(stored.id)&&stored.payload.created_by===profile.id&&stored.payload.org_id===profile.org_id&&JSON.stringify({...stored.payload,...(options?.relativeDue?{due_at:'relative'}:{})})===identity)prior=stored;}catch{/* Memory recovery still works when storage is unavailable. */}
   const intent=prior??{id:crypto.randomUUID(),payload};pending.current.set(key,intent);try{sessionStorage.setItem(key,JSON.stringify(intent));}catch{/* optional storage */}
   const {data,error}=await supabase.from('tasks').insert({...intent.payload,id:intent.id}).select().abortSignal(AbortSignal.timeout(15000)).single();
   let saved=data;
   if(error){const lookup=await supabase.from('tasks').select('*').eq('id',intent.id).abortSignal(AbortSignal.timeout(10000)).maybeSingle();saved=lookup.data;if(lookup.error||!saved||saved.created_by!==profile.id||saved.org_id!==profile.org_id)throw new Error('Unconfirmed task');}
   pending.current.delete(key);try{sessionStorage.removeItem(key);}catch{/* optional storage */}
   await fetchTasks();return saved;
  }catch{if(account.current===profile.id)E('The task is not confirmed saved. Retry the unchanged draft to recover its original receipt.');return null;}
  finally{running.current.delete(key);}
 },[profile?.id,profile?.org_id,fetchTasks]);
 const updateTask=useCallback(async(id:string,updates:Partial<Task>)=>{
  try{const {error}=await supabase.from('tasks').update(updates).eq('id',id).abortSignal(AbortSignal.timeout(15000));if(error)throw error;await fetchTasks();return true;}
  catch{E('The task update is not confirmed. Refresh its current state before trying again.');return false;}
 },[fetchTasks]);
 const completeTask=useCallback((id:string)=>updateTask(id,{status:'Completed'}),[updateTask]);
 return{tasks,isLoading,error,createTask,updateTask,completeTask,refresh:fetchTasks};
}
