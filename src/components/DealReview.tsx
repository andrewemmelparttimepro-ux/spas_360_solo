import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {useAuth} from '@/contexts/AuthContext';
import {centralWallClockToIso} from '@/lib/jobSchedule';
import type {Deal} from '@/types/database';

type Assignment={id:string;previous_user_id:string|null;assigned_to:string|null;changed_at:string};
export default function DealReview({deal,onRefresh}:{deal:Deal;onRefresh:()=>Promise<void>}){
 const {profile}=useAuth();const [editing,setEditing]=useState(false);const [state,setState]=useState('active');const [note,setNote]=useState('');const [due,setDue]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState<string|null>(null);
 const [names,setNames]=useState<Record<string,string>>({});const [history,setHistory]=useState<Assignment[]>([]);
 const editable=profile && (profile.id===deal.assigned_to || ['owner_manager','service_manager'].includes(profile.role));
 useEffect(()=>{
  let current=true;setHistory([]);setNames({});
  const load=async()=>{
   const signal=AbortSignal.timeout(15_000);
   const [people,rows]=await Promise.all([
    supabase.from('profiles').select('id,first_name,last_name').eq('org_id',deal.org_id).abortSignal(signal),
    supabase.from('deal_assignment_history').select('id,previous_user_id,assigned_to,changed_at').eq('deal_id',deal.id).order('changed_at',{ascending:false}).limit(50).abortSignal(signal),
   ]);
   if(!current)return;
   if(people.error||rows.error){setError('Assignment history could not load. Reopen this deal to retry.');return;}
   setNames(Object.fromEntries((people.data??[]).map(p=>[p.id,`${p.first_name} ${p.last_name}`])));setHistory(rows.data??[]);
  };void load();return()=>{current=false;};
 },[deal.id,deal.org_id,deal.updated_at]);
 return <section className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3" aria-label="Deal review and credit">
  <h2 className="font-semibold text-ink-100">Next step and sales credit</h2>
  <p className="text-sm text-ink-400">{deal.lead_review_state==='dormant'?'Dormant until review':deal.lead_review_state==='active'?'Active next step':'No deliberate lead review recorded'} · {deal.lead_review_due_at?new Date(deal.lead_review_due_at).toLocaleDateString():'Review date not set'}</p>
  <p className="text-sm text-ink-300">{deal.lead_review_note||'Record the next action or why this lead is dormant. Existing follow-up tasks stay open.'}</p>
  {deal.amount===null&&<p className="text-sm text-amber-600">Sale amount unknown. {deal.amount_exception_note?`Owner exception: ${deal.amount_exception_note}`:'Revenue remains incomplete until reconciled.'}</p>}
  <p className="text-sm text-ink-400">Closing credit: {deal.closed_credit_user_id?names[deal.closed_credit_user_id]??'Recorded teammate':'Not recorded historically'}. Current ownership and closing credit are separate.</p>
  {error&&<p role="alert" className="text-sm text-amber-600">{error}</p>}
  {editable&&<button className="text-sm text-brand-500" onClick={()=>{setState(deal.lead_review_state??'active');setNote(deal.lead_review_note??'');setDue(deal.lead_review_due_at?.slice(0,10)??'');setEditing(!editing);}}>{editing?'Cancel review':'Record lead review'}</button>}
  {editing&&<form data-unsaved="true" className="grid gap-3" onSubmit={async e=>{
   e.preventDefault();setBusy(true);setError(null);
   const changes={lead_review_state:state as 'active'|'dormant',lead_review_note:note.trim(),lead_review_due_at:centralWallClockToIso(due,'17:00')};
   const {data,error:writeError}=await supabase.from('deals').update(changes).eq('id',deal.id).eq('updated_at',deal.updated_at).select('id');
   if(writeError||!data?.length)setError(writeError?.message??'This deal changed. Reload and review before saving.');else{setEditing(false);await onRefresh();}
   setBusy(false);
  }}><label className="text-sm">Lead state<select value={state} onChange={e=>setState(e.target.value)} className="block w-full rounded border border-ink-700 bg-ink-950 p-2"><option value="active">Active next step</option><option value="dormant">Dormant, review later</option></select></label><label className="text-sm">Next action or dormant reason<textarea required minLength={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)} className="block w-full rounded border border-ink-700 bg-ink-950 p-2"/></label><label className="text-sm">Review date<input required type="date" value={due} onChange={e=>setDue(e.target.value)} className="block w-full rounded border border-ink-700 bg-ink-950 p-2"/></label><button disabled={busy} className="rounded bg-brand-500 px-3 py-2 text-sm text-white">Save review</button></form>}
  <details><summary className="text-sm text-ink-400">Recorded assignment changes ({history.length}{history.length===50?'+':''})</summary><p className="my-2 text-xs text-ink-500">Tracking begins with this release. Older ownership is not inferred. Most recent 50 changes.</p>{history.map(h=><p key={h.id} className="my-1 text-xs text-ink-400">{new Date(h.changed_at).toLocaleString()}: {h.previous_user_id?names[h.previous_user_id]??'Prior teammate':'Initial assignment'} → {h.assigned_to?names[h.assigned_to]??'Teammate':'Unassigned'}</p>)}</details>
 </section>;
}
