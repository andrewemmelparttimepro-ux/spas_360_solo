import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, Plus, Save, X, Pencil, BadgeDollarSign, Handshake, Wrench, Package, Bot, Copy } from 'lucide-react';
import { useContact } from '@/hooks/useContacts';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Contact, ContactType } from '@/types/database';
import { useToast } from '@/components/ui/Toast';
import QuickDealModal from '@/components/QuickDealModal';
import MentionInput from '@/components/MentionInput';
import MentionText from '@/components/MentionText';
import { composeMentionBody, parseMentions, notifyMentionedUsers, isAriNote, ariNoteBody, stripMentions, ARI_NOTE_PREFIX, type PickedMention } from '@/lib/mentions';
import { runAriMention } from '@/agent/ariTasks';
import { friendlyAgentError } from '@/agent/run';

// The full relationship behind the customer card: deals, service jobs, equipment
type RelDeal = { id: string; title: string; amount: number | null; created_at: string; stage?: { name: string } | null };
type RelJob = { id: string; title: string; status: string; scheduled_at: string | null; created_at: string };
type RelEquip = { id: string; product: string; brand: string | null; sku: string; status: string };
type RelText = { id: string; body: string; sender_type: string; created_at: string };

// One chronological stream: everything that happened with this customer
interface TimelineEvent {
  at: string;
  kind: 'note' | 'deal' | 'job' | 'task' | 'text';
  text: string;
  link?: string;
}

const CONTACT_TYPE_OPTIONS: ContactType[] = ['Lead', 'Prospect', 'Customer', 'Past Customer'];
const TYPE_COLORS: Record<ContactType, string> = {
  Customer: 'bg-emerald-500/15 text-emerald-300',
  Lead: 'bg-amber-500/15 text-amber-300',
  Prospect: 'bg-brand-500/15 text-brand-300',
  'Past Customer': 'bg-ink-950 text-ink-300',
};

function EditableTypeBadge({ value, onSave }: { value: ContactType; onSave: (u: Partial<Contact>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  if (editing) {
    return (
      <select ref={ref} value={value} onChange={async e => { await onSave({ customer_type: e.target.value as ContactType }); setEditing(false); }} onBlur={() => setEditing(false)} className="px-2 py-1 border border-brand-500 rounded-lg text-sm outline-none bg-ink-900 focus:ring-2 focus:ring-brand-500/30">
        {CONTACT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    );
  }
  return (
    <span onClick={() => setEditing(true)} className={cn('px-3 py-1 rounded-full text-sm font-medium cursor-pointer hover:ring-2 hover:ring-brand-500/30 transition-all group inline-flex items-center gap-1', TYPE_COLORS[value] ?? 'bg-ink-950 text-ink-100')} title="Click to change type">
      {value}<Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </span>
  );
}

function EditableDetailRow({ label, value, field, onSave, type = 'text' }: { label: string; value: string | null; field: string; onSave: (u: Partial<Contact>) => Promise<boolean>; type?: 'text' | 'email' | 'tel'; }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(value ?? ''); }, [value, editing]);
  const commit = async () => { if (draft === (value ?? '')) { setEditing(false); return; } setSaving(true); await onSave({ [field]: draft || null } as Partial<Contact>); setSaving(false); setEditing(false); };
  const cancel = () => { setDraft(value ?? ''); setEditing(false); };
  return (
    <div>
      <dt className="text-xs font-medium text-ink-500 mb-0.5">{label}</dt>
      {editing ? (
        <input ref={inputRef} type={type} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }} disabled={saving} className="px-2 py-1 border border-brand-500 rounded-lg text-sm outline-none bg-ink-900 focus:ring-2 focus:ring-brand-500/30 w-full" />
      ) : (
        <dd onClick={() => setEditing(true)} className="text-sm text-ink-100 cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 hover:bg-brand-500/10 hover:ring-1 hover:ring-brand-500/30 transition-colors group inline-flex items-center gap-1" title="Click to edit">
          {value || '\u2014'}<Pencil className="w-3 h-3 text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </dd>
      )}
    </div>
  );
}

type ContactWithAssigned = Contact & { assigned?: { id: string; first_name: string; last_name: string } | null };

export default function ContactDetail() {
  const { id } = useParams();
  const { contact: rawContact, isLoading, updateContact } = useContact(id);
  const contact = rawContact as ContactWithAssigned | null;
  const { profile } = useAuth();
  const { notes, createNote } = useNotes({ contactId: id });
  const { tasks, createTask, completeTask } = useTasks({ contactId: id });
  const { toast } = useToast();
  const navigate = useNavigate();
  const [newNote, setNewNote] = useState('');
  const pickedRef = useRef<PickedMention[]>([]);
  const [ariBusy, setAriBusy] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [team, setTeam] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
  const [showQuickDeal, setShowQuickDeal] = useState(false);
  const [relDeals, setRelDeals] = useState<RelDeal[]>([]);
  const [relJobs, setRelJobs] = useState<RelJob[]>([]);
  const [relEquip, setRelEquip] = useState<RelEquip[]>([]);

  const [relTexts, setRelTexts] = useState<RelText[]>([]);

  // The 360° view: everything this customer has going on across the app
  useEffect(() => {
    if (!id) return;
    Promise.all([
      supabase.from('deals').select('id, title, amount, created_at, stage:stage_id(name)').eq('contact_id', id).order('updated_at', { ascending: false }),
      supabase.from('jobs').select('id, title, status, scheduled_at, created_at').eq('contact_id', id).order('created_at', { ascending: false }),
      supabase.from('inventory_items').select('id, product, brand, sku, status').eq('customer_id', id),
      supabase.from('communication_threads').select('id').eq('contact_id', id),
    ]).then(async ([d, j, inv, threads]) => {
      setRelDeals((d.data as unknown as RelDeal[]) ?? []);
      setRelJobs((j.data as unknown as RelJob[]) ?? []);
      setRelEquip((inv.data as unknown as RelEquip[]) ?? []);
      const threadIds = (threads.data ?? []).map(t => t.id);
      if (threadIds.length > 0) {
        const { data: msgs } = await supabase.from('messages')
          .select('id, body, sender_type, created_at')
          .in('thread_id', threadIds)
          .order('created_at', { ascending: false })
          .limit(15);
        setRelTexts((msgs as RelText[]) ?? []);
      }
    });
  }, [id]);

  const isManager = profile?.role === 'owner_manager' || profile?.role === 'service_manager';
  const isOwner = !!profile && contact?.assigned_to === profile.id;
  const assignedName = contact?.assigned ? `${contact.assigned.first_name} ${contact.assigned.last_name}` : null;

  // Managers get the reassign control — load the team for it
  useEffect(() => {
    if (!isManager || !profile) return;
    supabase.from('profiles').select('id, first_name, last_name').eq('org_id', profile.org_id).order('first_name')
      .then(({ data }) => setTeam(data ?? []));
  }, [isManager, profile]);

  // Edits are always allowed — but edits by anyone other than the assigned
  // salesperson leave a visible trail, and the assignment (commission) stays put.
  const saveContact = async (updates: Partial<Contact>) => {
    const ok = await updateContact(updates);
    toast(ok ? 'Contact updated' : 'Failed to save', ok ? 'success' : 'error');
    if (ok && profile && contact && contact.assigned_to && contact.assigned_to !== profile.id) {
      const fields = Object.keys(updates).join(', ').replace(/_/g, ' ');
      await supabase.from('notes').insert({
        contact_id: contact.id,
        body: `✏️ ${profile.first_name} ${profile.last_name} updated ${fields} — ${assignedName ?? 'the assigned salesperson'} remains the assigned salesperson.`,
        created_by: profile.id,
      });
    }
    return ok;
  };

  const reassign = async (newOwnerId: string) => {
    if (!contact || !profile) return;
    const newOwner = team.find(t => t.id === newOwnerId);
    const ok = await updateContact({ assigned_to: newOwnerId });
    if (ok && newOwner) {
      toast(`Reassigned to ${newOwner.first_name} ${newOwner.last_name}`, 'success');
      await supabase.from('notes').insert({
        contact_id: contact.id,
        body: `🔁 ${profile.first_name} ${profile.last_name} reassigned this customer from ${assignedName ?? 'unassigned'} to ${newOwner.first_name} ${newOwner.last_name}.`,
        created_by: profile.id,
      });
    }
  };

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  if (!contact) return <div className="flex flex-col items-center justify-center h-full text-ink-500"><p className="text-lg">Customer not found</p><Link to="/customers" className="text-brand-400 text-sm mt-2 hover:underline">Back to Customers</Link></div>;

  const handleAddNote = async () => {
    if (!newNote.trim() || !profile) return;
    const body = composeMentionBody(newNote, pickedRef.current);
    pickedRef.current = [];
    setNewNote('');
    await createNote(body, { contactId: contact.id });

    const senderName = `${profile.first_name} ${profile.last_name}`;
    await notifyMentionedUsers({
      body,
      senderId: profile.id,
      senderName,
      contextLabel: `${contact.first_name} ${contact.last_name}`,
      link: `/customers/${contact.id}`,
    });

    // @Ari: hand him the customer packet, post his work back as a note
    if (parseMentions(body).ari && !ariBusy) {
      setAriBusy(true);
      try {
        const result = await runAriMention({ surface: 'contact', entityId: contact.id, request: body, requesterName: senderName });
        await createNote(ARI_NOTE_PREFIX + result, { contactId: contact.id });
        toast('Ari finished — his work is in the notes', 'success');
      } catch (err) {
        toast(friendlyAgentError((err as Error).message ?? ''), 'error');
      } finally {
        setAriBusy(false);
      }
    }
  };

  const copyAriNote = async (body: string) => {
    await navigator.clipboard.writeText(stripMentions(ariNoteBody(body)));
    toast('Copied — paste it anywhere', 'success');
  };

  // One chronological stream — every touch on this relationship, newest first
  const timeline: TimelineEvent[] = [
    ...notes.map(n => ({
      at: n.created_at, kind: 'note' as const,
      text: isAriNote(n.body)
        ? `Ari delivered: ${stripMentions(ariNoteBody(n.body)).slice(0, 80)}…`
        : `${n.author_name ?? 'Note'}: ${stripMentions(n.body).slice(0, 90)}`,
    })),
    ...relDeals.map(d => ({
      at: d.created_at, kind: 'deal' as const,
      text: `Deal opened — ${d.title}${d.amount ? ` ($${Number(d.amount).toLocaleString()})` : ''}`,
      link: `/deals/${d.id}`,
    })),
    ...relJobs.map(j => ({
      at: j.created_at, kind: 'job' as const,
      text: `Service job — ${j.title} · ${j.status}`,
      link: `/service/${j.id}`,
    })),
    ...tasks.map(t => ({
      at: t.created_at, kind: 'task' as const,
      text: `${t.status === 'Completed' ? '✓ ' : ''}Task — ${t.title}`,
    })),
    ...relTexts.map(m => ({
      at: m.created_at, kind: 'text' as const,
      text: `${m.sender_type === 'customer' ? 'Text from customer' : 'Text sent'} — ${(m.body ?? '').slice(0, 80)}`,
      link: '/communication',
    })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 25);

  const TIMELINE_STYLE: Record<TimelineEvent['kind'], { dot: string; label: string }> = {
    note: { dot: 'bg-ink-500', label: 'text-ink-300' },
    deal: { dot: 'bg-brand-400', label: 'text-brand-300' },
    job: { dot: 'bg-emerald-400', label: 'text-emerald-300' },
    task: { dot: 'bg-amber-400', label: 'text-amber-300' },
    text: { dot: 'bg-violet-400', label: 'text-violet-300' },
  };
  const handleAddTask = async () => { if (!newTaskTitle.trim()) return; await createTask({ title: newTaskTitle, contact_id: contact.id, due_at: new Date(Date.now() + 24*60*60*1000).toISOString(), priority: 'Medium', status: 'Pending' }); setNewTaskTitle(''); setShowTaskForm(false); };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/customers" className="p-2 hover:bg-ink-800 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5 text-ink-400" /></Link>
        <div className="flex-1">
          <h1 className="text-xl sm:text-2xl font-bold text-ink-100">{contact.first_name} {contact.last_name}</h1>
          <div className="flex items-center space-x-4 mt-1 text-sm text-ink-400">
            <span className="flex items-center"><Phone className="w-3.5 h-3.5 mr-1" />{contact.phone}</span>
            {contact.email && <span className="flex items-center"><Mail className="w-3.5 h-3.5 mr-1" />{contact.email}</span>}
          </div>
        </div>
        <button
          onClick={() => setShowQuickDeal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium transition-colors shadow-sm"
          title="New deal for this customer"
        >
          <Handshake className="w-4 h-4" />
          <span className="hidden sm:inline">New Deal</span>
        </button>
        <EditableTypeBadge value={contact.customer_type} onSave={saveContact} />
      </div>

      {showQuickDeal && (
        <QuickDealModal
          contactId={contact.id}
          onClose={() => setShowQuickDeal(false)}
          onCreated={(dealId) => navigate('/deals', { state: { highlight: dealId } })}
        />
      )}

      {/* Ownership — who gets the commission, always visible */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-500/10 border border-brand-500/25 text-[13px] font-semibold text-brand-300">
          <BadgeDollarSign className="w-3.5 h-3.5" />
          {assignedName ? `${assignedName}'s customer` : 'Unassigned'}
        </span>
        {isManager && team.length > 0 && (
          <select
            value={contact.assigned_to ?? ''}
            onChange={e => e.target.value && reassign(e.target.value)}
            className="bg-ink-900 border border-ink-700 text-xs text-ink-300 rounded-lg px-2 py-1.5 outline-none focus:border-brand-500"
            title="Reassign (managers only — gets logged)"
          >
            <option value="" disabled>Reassign…</option>
            {team.map(t => <option key={t.id} value={t.id}>{t.first_name} {t.last_name}</option>)}
          </select>
        )}
        {!isOwner && !isManager && contact.assigned_to && (
          <span className="text-xs text-amber-400/90 font-medium">
            You can edit, but changes are logged — commission stays with {assignedName ?? 'the assigned salesperson'}.
          </span>
        )}
      </div>
      {/* The relationship — deals, service, equipment. The card's full story. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-4">
          <h2 className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Handshake className="w-3.5 h-3.5" />Deals ({relDeals.length})
          </h2>
          {relDeals.length === 0 ? (
            <p className="text-xs text-ink-500 py-2">No deals yet — start one with the button above</p>
          ) : (
            <div className="space-y-2">
              {relDeals.slice(0, 5).map(d => (
                <Link key={d.id} to={`/deals/${d.id}`} className="block p-2.5 bg-ink-950 rounded-lg border border-ink-800 hover:border-brand-500/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink-100 font-medium truncate">{d.title}</span>
                    <span className="font-mono text-xs font-bold text-ink-300 shrink-0">${(Number(d.amount) || 0).toLocaleString()}</span>
                  </div>
                  {d.stage?.name && <span className="text-[10px] text-ink-500">{d.stage.name}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-4">
          <h2 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Wrench className="w-3.5 h-3.5" />Service Jobs ({relJobs.length})
          </h2>
          {relJobs.length === 0 ? (
            <p className="text-xs text-ink-500 py-2">No service history</p>
          ) : (
            <div className="space-y-2">
              {relJobs.slice(0, 5).map(j => (
                <Link key={j.id} to={`/service/${j.id}`} className="block p-2.5 bg-ink-950 rounded-lg border border-ink-800 hover:border-emerald-500/40 transition-colors">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-ink-100 font-medium truncate">{j.title}</span>
                    <span className="text-[10px] text-emerald-300 shrink-0">{j.status}</span>
                  </div>
                  {j.scheduled_at && <span className="text-[10px] text-ink-500">{new Date(j.scheduled_at).toLocaleDateString()}</span>}
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-4">
          <h2 className="text-xs font-semibold text-violet-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <Package className="w-3.5 h-3.5" />Equipment Owned ({relEquip.length})
          </h2>
          {relEquip.length === 0 ? (
            <p className="text-xs text-ink-500 py-2">Nothing on record yet</p>
          ) : (
            <div className="space-y-2">
              {relEquip.slice(0, 5).map(i => (
                <Link key={i.id} to={`/inventory/${i.id}`} className="block p-2.5 bg-ink-950 rounded-lg border border-ink-800 hover:border-violet-500/40 transition-colors">
                  <span className="block text-sm text-ink-100 font-medium truncate">{i.brand ? `${i.brand} ` : ''}{i.product}</span>
                  <span className="text-[10px] text-ink-500 font-mono">{i.sku} · {i.status}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">Contact Details</h2><span className="text-[10px] text-ink-500">Click any value to edit</span></div>
          <div className="space-y-4">
            <EditableDetailRow label="Phone" value={contact.phone} field="phone" onSave={saveContact} type="tel" />
            <EditableDetailRow label="Secondary Phone" value={contact.phone_secondary} field="phone_secondary" onSave={saveContact} type="tel" />
            <EditableDetailRow label="Email" value={contact.email} field="email" onSave={saveContact} type="email" />
            <EditableDetailRow label="Address" value={contact.mailing_address} field="mailing_address" onSave={saveContact} />
            <div><dt className="text-xs font-medium text-ink-500 mb-0.5">Lead Source</dt><dd className="text-sm text-ink-100">{contact.lead_source}</dd></div>
            <div><dt className="text-xs font-medium text-ink-500 mb-0.5">Tags</dt><dd className="text-sm text-ink-100">{contact.tags?.join(', ') || '\u2014'}</dd></div>
            <div><dt className="text-xs font-medium text-ink-500 mb-0.5">Created</dt><dd className="text-sm text-ink-100">{new Date(contact.created_at).toLocaleDateString()}</dd></div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-4">Notes</h2>
            <div className="flex items-start space-x-3 mb-4">
              <MentionInput
                value={newNote}
                onValueChange={setNewNote}
                picked={pickedRef}
                onSubmit={handleAddNote}
                menuDirection="down"
                placeholder="Add a note… @ mentions a teammate, customer, or Ari"
                className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500 resize-none bg-transparent"
              />
              <button onClick={handleAddNote} className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg font-medium hover:bg-brand-600 shrink-0">Add</button>
            </div>
            {ariBusy && (
              <div className="flex items-center gap-2.5 p-3 mb-3 rounded-lg bg-brand-500/10 border border-brand-500/30">
                <Bot className="w-4 h-4 text-brand-400 shrink-0" />
                <span className="text-sm text-brand-300 font-medium">Ari is on it — pulling the customer packet and doing the work…</span>
                <span className="flex space-x-1 ml-auto">
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
              </div>
            )}
            <div className="space-y-3 max-h-96 overflow-y-auto">{notes.length === 0 && !ariBusy ? <p className="text-sm text-ink-500 text-center py-4">No notes yet</p> : notes.map(n => isAriNote(n.body) ? (
              <div key={n.id} className="p-3 bg-brand-500/5 rounded-lg border border-brand-500/30">
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-brand-400"><Bot className="w-3.5 h-3.5" />Ari — Sales Assistant</span>
                  <button onClick={() => copyAriNote(n.body)} className="flex items-center gap-1 text-[11px] font-medium text-ink-400 hover:text-brand-300 transition-colors" title="Copy to clipboard">
                    <Copy className="w-3 h-3" />Copy
                  </button>
                </div>
                <p className="text-sm text-ink-100 whitespace-pre-wrap"><MentionText body={ariNoteBody(n.body)} /></p>
                <p className="text-xs text-ink-500 mt-2">for {n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p>
              </div>
            ) : (
              <div key={n.id} className="p-3 bg-ink-950 rounded-lg border border-ink-800">
                <p className="text-sm text-ink-100 whitespace-pre-wrap"><MentionText body={n.body} /></p>
                <p className="text-xs text-ink-500 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p>
              </div>
            ))}</div>
          </div>
          <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">Tasks</h2><button onClick={() => setShowTaskForm(true)} className="text-sm text-brand-400 hover:text-brand-400 flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Task</button></div>
            {showTaskForm && <div className="flex space-x-3 mb-4"><input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTask()} placeholder="Task title..." className="flex-1 px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" autoFocus /><button onClick={handleAddTask} className="px-3 py-2 bg-brand-500 text-white text-sm rounded-lg"><Save className="w-4 h-4" /></button><button onClick={() => setShowTaskForm(false)} className="px-3 py-2 text-ink-500 hover:text-ink-300"><X className="w-4 h-4" /></button></div>}
            <div className="space-y-2">{tasks.length === 0 ? <p className="text-sm text-ink-500 text-center py-4">No tasks yet</p> : tasks.map(t => <div key={t.id} className="flex items-center p-3 bg-ink-950 rounded-lg border border-ink-800"><input type="checkbox" checked={t.status === 'Completed'} onChange={() => t.status !== 'Completed' && completeTask(t.id)} className="w-4 h-4 rounded border-ink-600 text-brand-400 mr-3" /><span className={`flex-1 text-sm ${t.status === 'Completed' ? 'line-through text-ink-500' : 'text-ink-100'}`}>{t.title}</span><span className="text-xs text-ink-500">{new Date(t.due_at).toLocaleDateString()}</span></div>)}</div>
          </div>

          {/* The whole story in order — notes, deals, jobs, tasks, texts */}
          <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-4">Timeline</h2>
            {timeline.length === 0 ? (
              <p className="text-sm text-ink-500 text-center py-4">Nothing yet — the story starts with the first note or deal</p>
            ) : (
              <div className="relative pl-4 space-y-3 before:absolute before:left-[3px] before:top-1.5 before:bottom-1.5 before:w-px before:bg-ink-700">
                {timeline.map((ev, i) => {
                  const style = TIMELINE_STYLE[ev.kind];
                  const body = (
                    <>
                      <span className={cn('absolute -left-4 top-1.5 w-[7px] h-[7px] rounded-full ring-2 ring-ink-900', style.dot)} />
                      <span className="block text-sm text-ink-100 leading-snug">{ev.text}</span>
                      <span className="block text-[11px] text-ink-500 mt-0.5">
                        {new Date(ev.at).toLocaleDateString([], { month: 'short', day: 'numeric' })} · {new Date(ev.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </>
                  );
                  return ev.link ? (
                    <Link key={`${ev.kind}-${i}`} to={ev.link} className="relative block hover:bg-ink-800/60 rounded-md px-2 py-1 -mx-2 transition-colors">{body}</Link>
                  ) : (
                    <div key={`${ev.kind}-${i}`} className="relative px-2 py-1 -mx-2">{body}</div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
