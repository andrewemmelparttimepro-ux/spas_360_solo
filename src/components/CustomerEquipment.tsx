import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useDraftState, clearDrafts } from '@/hooks/useDraftState';

type Equipment = { id: string; manufacturer: string | null; model: string; serial_number: string | null; model_year: number | null; source_note: string; warranty_source: string | null; jobs: { id: string; title: string; status: string }[] };
export default function CustomerEquipment({ contactId, selectedId, onSelect }: { contactId: string; selectedId?: string | null; onSelect?: (id: string | null) => Promise<boolean> }) {
  const { profile } = useAuth();
  const [items,setItems] = useState<Equipment[]>([]);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string | null>(null);
  const [adding,setAdding] = useState(false);
  const [busy,setBusy] = useState(false);
  const scope = `equipment-${profile?.id ?? "signed-out"}-${contactId}`;
  const [draft,setDraft] = useDraftState(scope,'unit',{manufacturer:'',model:'',serial_number:'',model_year:'',source_note:'',warranty_source:''});
  const canAdd = ['owner_manager','service_manager','salesperson'].includes(profile?.role ?? '');
  const load = useCallback(async () => {
    setLoading(true);
    const {data,error:readError}=await supabase.from('customer_equipment').select('id,manufacturer,model,serial_number,model_year,source_note,warranty_source,jobs(id,title,status)').eq('contact_id',contactId).is('retired_at',null).order('created_at');
    if (readError) setError('Equipment could not load. Retry before relying on this list.');
    else {setItems((data ?? []) as unknown as Equipment[]);setError(null);}
    setLoading(false);
  },[contactId]);
  useEffect(()=>{setItems([]);void load();},[load]);
  const save = async (event: React.FormEvent) => {
    event.preventDefault(); if(!profile || busy) return;
    setBusy(true); setError(null);
    const {error:writeError}=await supabase.from('customer_equipment').insert({org_id:profile.org_id,contact_id:contactId,created_by:profile.id,manufacturer:draft.manufacturer.trim() || null,model:draft.model.trim(),serial_number:draft.serial_number.trim() || null,model_year:draft.model_year?Number(draft.model_year):null,source_note:draft.source_note.trim(),warranty_source:draft.warranty_source.trim() || null});
    if(writeError) setError(writeError.code==='23505'?'This serial number is already recorded for this customer.':'Equipment could not save. Your draft remains here.');
    else {clearDrafts(scope);setDraft({manufacturer:'',model:'',serial_number:'',model_year:'',source_note:'',warranty_source:''});setAdding(false);await load();}
    setBusy(false);
  };
  return <section className="rounded-xl border border-ink-700 bg-ink-900 p-4 space-y-3" aria-label="Customer equipment">
    <div className="flex justify-between gap-2"><h2 className="font-semibold text-ink-100">Customer equipment</h2>{canAdd && <button onClick={()=>setAdding(!adding)} className="text-sm text-brand-500">{adding?'Cancel':'Add unit'}</button>}</div>
    <p className="text-xs text-ink-500">Record each owned unit, including purchases elsewhere. Missing serials and warranty evidence stay unknown.</p>
    {error && <p role="alert" className="text-sm text-amber-600">{error} <button onClick={()=>void load()} className="underline">Retry</button></p>}
    {onSelect && <label className="block text-sm text-ink-400">Equipment for this job<select value={selectedId ?? ''} disabled={busy || loading} onChange={async e=>{setBusy(true); const ok=await onSelect(e.target.value || null);if(!ok)setError('Equipment link did not save.');setBusy(false);}} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 p-2"><option value="">Not selected</option>{items.map(item=><option key={item.id} value={item.id}>{item.manufacturer} {item.model} · {item.serial_number ?? 'Serial unknown'}</option>)}</select></label>}
    {adding && <form onSubmit={save} data-unsaved="true" className="grid gap-3 sm:grid-cols-2">{([['manufacturer','Manufacturer'],['model','Model'],['serial_number','Serial number'],['model_year','Model year'],['source_note','Source / how verified'],['warranty_source','Warranty source (optional)']] as const).map(([key,label])=><label key={key} className="text-sm text-ink-400">{label}<input required={key==='model'||key==='source_note'} minLength={key==='source_note'?3:undefined} maxLength={key==='source_note'||key==='warranty_source'?2000:200} type={key==='model_year'?'number':'text'} min={key==='model_year'?1900:undefined} max={key==='model_year'?2100:undefined} value={draft[key]} onChange={e=>setDraft({...draft,[key]:e.target.value})} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-950 p-2"/></label>)}<button disabled={busy} className="rounded-lg bg-brand-500 px-3 py-2 text-sm font-semibold text-white">{busy?'Saving…':'Save equipment'}</button></form>}
    {loading && <p className="text-sm text-ink-500">Loading equipment…</p>}
    {!loading && !items.length && !error && <p className="text-sm text-ink-500">No equipment records yet. Linked inventory remains in the inventory section.</p>}
    {items.map(item=><div key={item.id} className={`rounded-lg border p-3 ${item.id===selectedId?'border-brand-500':'border-ink-700'}`}><p className="font-semibold text-ink-100">{item.manufacturer} {item.model}{item.id===selectedId?' · This job':''}</p><p className="text-sm text-ink-400">Serial: {item.serial_number || 'Unknown'} · Year: {item.model_year || 'Unknown'}</p><p className="text-xs text-ink-500">Source: {item.source_note}</p><p className="text-xs text-ink-500">Warranty evidence: {item.warranty_source || 'Not recorded'}</p>{item.jobs?.map(job=><Link className="mt-1 block text-xs text-brand-500" key={job.id} to={`/service/${job.id}`}>{job.title} · {job.status}</Link>)}</div>)}
  </section>;
}
