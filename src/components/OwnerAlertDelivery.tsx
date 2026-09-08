import {useCallback,useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {supabase} from '@/lib/supabase';
import {useAuth} from '@/contexts/AuthContext';

type AlertReceipt={id:string;title:string;link:string|null;created_at:string;read:boolean;marked_read_at:string|null;recipient:string;state:string;accepted:number|null;failed:number|null;expired:number|null;detail:string|null;followup_due:boolean};
type Snapshot={as_of:string;followup_hours:number;items:AlertReceipt[]};
function isSnapshot(value:unknown):value is Snapshot{
 if(!value||typeof value!=='object'||!('as_of' in value)||typeof value.as_of!=='string'||!('followup_hours' in value)||typeof value.followup_hours!=='number'||!('items' in value)||!Array.isArray(value.items))return false;
 return value.items.every(row=>row&&typeof row.id==='string'&&typeof row.title==='string'&&typeof row.recipient==='string'&&typeof row.state==='string'&&typeof row.read==='boolean'&&typeof row.followup_due==='boolean');
}
const stateLabels:Record<string,string>={unconfigured:'Push is not configured',unregistered:'No registered device',queued:'Awaiting push response',accepted:'Push service accepted',partial:'Some devices accepted',failed:'Push dispatch failed',unknown:'Push outcome unknown',legacy_unverified:'Older alert: delivery unverified'};

export default function OwnerAlertDelivery(){
 const {profile}=useAuth();const [open,setOpen]=useState(false);const [hours,H]=useState(24);const [onlyDue,D]=useState(true);
 const [snapshot,S]=useState<Snapshot|null>(null);const [error,E]=useState<string|null>(null);const [busy,B]=useState(false);const sequence=useRef(0);
 const refresh=useCallback(async()=>{
  if(profile?.role!=='owner_manager')return;
  const request=++sequence.current;B(true);
  try{const {data,error}=await supabase.rpc('owner_alert_delivery',{p_hours:hours}).abortSignal(AbortSignal.timeout(12000));
   if(request!==sequence.current)return;
   if(error||!isSnapshot(data))E('Alert receipts could not refresh. The last dated results remain visible.');else{S(data);E(null);}
  }catch{if(request===sequence.current)E('The connection was interrupted. Retry to read current alert receipts.');}
  finally{if(request===sequence.current)B(false);}
 },[profile?.id,profile?.role,hours]);
 useEffect(()=>{S(null);E(null);return()=>{sequence.current++;};},[profile?.id]);
 useEffect(()=>{if(!open)return;void refresh();return()=>{sequence.current++;};},[open,refresh]);
 if(profile?.role!=='owner_manager')return null;
 const rows=snapshot?.items.filter(row=>!onlyDue||row.followup_due)??[];
 return <details open={open} onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary className="cursor-pointer text-sm font-semibold text-ink-100">Alert delivery and follow-up</summary>
  {open&&<div className="mt-3 space-y-3 text-sm">
   <p className="text-ink-400">Push acceptance does not prove a lock-screen alert. “Marked read” records the recipient’s in-app action; it does not prove the task is complete.</p>
   <div className="flex flex-wrap items-center gap-3"><label>Follow up after <select value={hours} onChange={e=>H(Number(e.target.value))} className="rounded border border-ink-700 bg-ink-950 p-2">{[1,4,24,48,72,168].map(value=><option key={value} value={value}>{value} hours unread</option>)}</select></label><label className="flex items-center gap-2"><input type="checkbox" checked={onlyDue} onChange={e=>D(e.target.checked)}/> Show follow-ups only</label><button disabled={busy} onClick={()=>void refresh()} className="rounded border border-ink-700 px-3 py-2">{busy?'Reading…':'Refresh receipts'}</button></div>
   <p className="text-xs text-ink-500">This filter is a review aid. It does not send reminders. Up to 100 recent alerts are shown.{snapshot&&` Read ${new Date(snapshot.as_of).toLocaleString()}.`}</p>
   {error&&<p role="alert" className="text-amber-600">{error}</p>}
   <div className="max-h-96 space-y-2 overflow-y-auto">{rows.map(row=><article key={row.id} className="rounded-lg bg-ink-950 p-3"><p className="font-semibold text-ink-100">{row.recipient} · {row.title}</p><p className="text-xs text-ink-400">{new Date(row.created_at).toLocaleString()} · {stateLabels[row.state]??'Outcome unverified'}</p><p className="text-xs text-ink-400">{row.read?`Marked read${row.marked_read_at?` ${new Date(row.marked_read_at).toLocaleString()}`:'; time was not recorded'}`:'Not marked read'}{row.followup_due?' · Follow-up due':''}</p>{row.detail&&<p className="text-xs text-ink-500">{row.detail}</p>}{row.link?.startsWith('/')&&!row.link.startsWith('//')&&<Link to={row.link} className="mt-1 inline-block py-2 text-brand-500">Open linked work</Link>}</article>)}{snapshot&&rows.length===0&&<p className="text-ink-400">No matching alerts in these {snapshot.items.length} recent records.</p>}</div>
  </div>}
 </details>;
}
