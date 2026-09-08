import MorningDeliveryReceipts from './MorningDeliveryReceipts';
import OwnerAlertDelivery from './OwnerAlertDelivery';
import {isOwnerAttentionSnapshot} from '@/lib/operationalSnapshots';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface OwnerAttentionSnapshot {
  as_of: string; issue_count: number; counts: Record<string, number>; coverage: string;
  human_profiles: number; recently_signed_in: number; attendance_entries: number; checklist_templates: number; knowledge_unverified: number;
  items: { id: string; category: string; title: string; path: string; since: string; next_action: string }[];
  staff: { id: string; name: string; role: string; last_sign_in_at: string | null; registered_devices: number; unread_notifications: number; email_eligibility: string }[];
  scheduler: { name: string; active: boolean; last_status: string | null; last_finished: string | null; failures_7d: number; unrecovered_failure?:boolean;last_success_at?:string|null;last_failure_at?:string|null }[];
}
const date = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not recorded';
export default function OwnerAttention() {
  const { user, profile } = useAuth();
  const [snapshot, setSnapshot] = useState<OwnerAttentionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState('All');
  const [expanded,setExpanded]=useState(false);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    if (!user || profile?.role !== 'owner_manager') return;
    const request = ++generation.current;
    setLoading(true);
    const { data, error: readError } = await supabase.rpc('owner_attention', { p_days: 7 }).abortSignal(AbortSignal.timeout(12_000));
    if (request !== generation.current) return;
    setError(readError || !isOwnerAttentionSnapshot(data) ? 'Owner overview could not refresh. Previously loaded facts remain dated below.' : null);
    if (!readError && isOwnerAttentionSnapshot(data)) setSnapshot(data);
    setLoading(false);
  }, [user?.id, profile?.role]);
  useEffect(() => {
    setSnapshot(null); void refresh();
    const timer = window.setInterval(() => void refresh(), 60_000);
    const online = () => void refresh(); window.addEventListener('online', online);
    return () => { generation.current++; window.clearInterval(timer); window.removeEventListener('online', online); };
  }, [refresh]);
  if (profile?.role !== 'owner_manager') return null;
  const items = snapshot?.items.filter(item => category === 'All' || item.category === category) ?? [];
  return <section className="rounded-2xl border border-ink-700 bg-ink-900 p-4 space-y-3" aria-label="Owner Today">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-ink-100">Owner Today</h2><p className="text-xs text-ink-500">{snapshot ? `Data read ${date(snapshot.as_of)}` : 'Loading the dealership picture'}</p>{!expanded&&snapshot&&<p className="mt-1 text-sm text-ink-300">{snapshot.issue_count} items to review · {snapshot.staff.filter(s=>s.registered_devices>0).length}/{snapshot.human_profiles} people with registered alerts</p>}</div><div className="flex gap-2"><button aria-expanded={expanded} aria-controls="owner-today-details" onClick={()=>setExpanded(value=>!value)} className="rounded-lg bg-ink-800 px-3 py-2 text-sm font-semibold text-ink-100">{expanded?'Collapse Owner Today':'Expand Owner Today'}</button><button disabled={loading} onClick={() => void refresh()} className="rounded-lg border border-ink-700 px-3 py-2 text-sm text-ink-100">{loading ? 'Refreshing…' : 'Refresh'}</button></div></div>
    {error && <p role="alert" className="text-sm text-amber-600">{error}</p>}
    {snapshot?.scheduler.some(job=>job.active&&(job.unrecovered_failure??job.last_status==='failed'))&&<p role="alert" className="rounded-lg border border-amber-500/40 p-3 text-sm text-amber-600">Background work needs attention: {snapshot.scheduler.filter(job=>job.active&&(job.unrecovered_failure??job.last_status==='failed')).map(job=>job.name).join(', ')}. Expand Owner Today for the latest run times. This warning clears only after a newer successful run is read.</p>}
    {snapshot && <div id="owner-today-details" hidden={!expanded} className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[[snapshot.issue_count, 'Items to review'], [`${snapshot.recently_signed_in}/${snapshot.human_profiles}`, 'Latest sign-in within 7 days'], [snapshot.staff.filter(s => s.registered_devices > 0).length, 'People with registered alerts'], [snapshot.knowledge_unverified, 'Sources awaiting verification']].map(([value, label]) => <div key={label} className="rounded-xl bg-ink-950 p-3"><p className="text-2xl font-bold text-ink-100">{value}</p><p className="text-xs text-ink-500">{label}</p></div>)}</div>
      <label className="block text-sm text-ink-400">Review queue <select value={category} onChange={e => setCategory(e.target.value)} className="ml-2 rounded-lg border border-ink-700 bg-ink-950 p-2 text-ink-100"><option>All</option>{Object.keys(snapshot.counts).map(key => <option key={key}>{key}</option>)}</select></label>
      <div className="max-h-96 overflow-y-auto space-y-2">{items.map(item => <Link key={item.id} to={item.path} className="block rounded-xl border border-ink-700 p-3 hover:border-amber-500"><p className="text-xs font-semibold text-amber-600">{item.category} · Since {date(item.since)}</p><p className="text-sm font-semibold text-ink-100">{item.title}</p><p className="text-xs text-ink-500">{item.next_action}</p></Link>)}{items.length === 0 && <p className="text-sm text-ink-500">No items in this category at the displayed cutoff.</p>}</div>
      {snapshot.issue_count > snapshot.items.length && <p className="text-xs text-amber-600">Showing the first {snapshot.items.length} of {snapshot.issue_count} items. Open the relevant workspace for the complete queue.</p>}
      <details><summary className="cursor-pointer text-sm font-semibold text-ink-100">Staff access and delivery readiness</summary><div className="mt-3 space-y-2">{snapshot.staff.map(person => <div key={person.id} className="rounded-lg bg-ink-950 p-3 text-xs text-ink-400"><p className="font-semibold text-ink-100">{person.name} · {person.role.replaceAll('_', ' ')}</p><p>Latest sign-in: {date(person.last_sign_in_at)}</p><p>{person.registered_devices} registered devices · {person.unread_notifications} unread notices · Morning email: {person.email_eligibility}</p></div>)}</div><p className="mt-2 text-xs text-ink-500">Each staff member can enable alerts from their own signed-in device. Device registration does not prove a lock-screen delivery.</p></details>
      <details><summary className="cursor-pointer text-sm font-semibold text-ink-100">Background work and workflow enrollment</summary><div className="mt-3 space-y-2">{snapshot.scheduler.map(job => <div key={job.name} className="rounded-lg bg-ink-950 p-3 text-xs text-ink-400"><p className="font-semibold text-ink-100">{job.name}</p><p>{job.active ? 'Enabled' : 'Paused'} · Latest database run: {job.last_status ?? 'Not recorded'} · {date(job.last_finished)}</p><p>{job.failures_7d} failures in 7 days. A successful HTTP dispatch does not establish downstream email delivery.</p></div>)}</div><p className="mt-2 text-xs text-ink-500">{snapshot.attendance_entries === 0 ? 'No attendance entries: workflow use is not established; this is not employee absence.' : `${snapshot.attendance_entries} attendance entries recorded.`} {snapshot.checklist_templates} active checklist templates.</p></details>
      <MorningDeliveryReceipts />
      <OwnerAlertDelivery />
      <p className="text-xs leading-relaxed text-ink-500">{snapshot.coverage}</p>
    </div>}
  </section>;
}
