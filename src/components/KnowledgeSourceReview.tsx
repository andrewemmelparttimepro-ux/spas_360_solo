import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {useAuth} from '@/contexts/AuthContext';
import {useDraftState} from '@/hooks/useDraftState';
import {centralDateKey} from '@/lib/morningSummary';
type Source={id:string;updated_at:string;review_owner_id:string|null;review_due_at:string|null;verified_by:string|null};
export default function KnowledgeSourceReview({source,onSaved}:{source:Source;onSaved:()=>Promise<void>}){
 const {profile}=useAuth();const [open,setOpen]=useState(false);const [people,setPeople]=useState<{id:string;first_name:string;last_name:string}[]>([]);const [error,E]=useState<string|null>(null);const [busy,B]=useState(false);
 const [draft,D]=useDraftState(`knowledge-review-${profile?.id}-${source.id}`,'review',()=>({owner:source.review_owner_id??'',due:source.review_due_at?centralDateKey(new Date(source.review_due_at)):'',note:'',checked:false}));
 const allowed=['owner_manager','service_manager'].includes(profile?.role??'');
 useEffect(()=>{if(!open||!allowed)return;let active=true;void(async()=>{try{const{data,error}=await supabase.from('profiles').select('id,first_name,last_name').eq('org_id',profile!.org_id).in('role',['owner_manager','service_manager']).order('first_name').abortSignal(AbortSignal.timeout(12000));if(error)throw error;if(active){setPeople(data??[]);E(null);}}catch{if(active)E('Review owners could not load. Close and reopen to retry.');}})();return()=>{active=false;};},[open,allowed,profile?.id]);
 if(!allowed)return null;
 const save=async(event:React.FormEvent)=>{
  event.preventDefault();if(busy)return;B(true);E(null);
  try{const{error}=await supabase.rpc('review_knowledge_source',{p_document:source.id,p_version:source.updated_at,p_owner:draft.owner,p_due:draft.due,p_note:draft.note,p_checked:draft.checked}).abortSignal(AbortSignal.timeout(15000));
   if(error)throw error;
   D({...draft,note:'',checked:false});await onSaved();setOpen(false);
  }catch{E('The review is not confirmed saved. Reload this source and check its status before submitting again. Your draft is retained.');}
  finally{B(false);}
 };
 return <details className="w-full text-sm" open={open} onToggle={e=>setOpen(e.currentTarget.open)}><summary className="cursor-pointer text-brand-500">Assign or record a source review</summary>{open&&<form onSubmit={save} data-unsaved="true" className="mt-2 space-y-2 rounded-xl border border-ink-700 p-3">{error&&<p role="alert" className="text-amber-600">{error}</p>}<label className="block">Responsible manager<select required value={draft.owner} onChange={e=>D({...draft,owner:e.target.value})} className="mt-1 w-full rounded border border-ink-700 bg-ink-950 p-2"><option value="">Choose a manager</option>{people.map(p=><option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>)}</select></label><label className="block">Next review date (Central)<input required type="date" value={draft.due} onChange={e=>D({...draft,due:e.target.value})} className="mt-1 w-full rounded border border-ink-700 bg-ink-950 p-2"/></label><label className="block">Evidence checked or next step<textarea required minLength={8} maxLength={2000} value={draft.note} onChange={e=>D({...draft,note:e.target.value})} className="mt-1 w-full rounded border border-ink-700 bg-ink-950 p-2"/></label><label className="flex gap-2"><input type="checkbox" checked={draft.checked} onChange={e=>D({...draft,checked:e.target.checked})}/> I opened the source and verified its current applicability. Without this check, the source remains in review.</label><button disabled={busy} className="rounded bg-brand-500 px-3 py-2 font-semibold text-white">{busy?'Saving…':'Save review'}</button></form>}</details>;
}
