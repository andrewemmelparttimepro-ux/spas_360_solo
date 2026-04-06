import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, DollarSign, Calendar, User, AlertCircle, Plus, Save, X, Pencil } from 'lucide-react';
import { useDeal } from '@/hooks/usePipeline';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Deal, DealPriority } from '@/types/database';
import { useToast } from '@/components/ui/Toast';

const priorityColors: Record<DealPriority, string> = { High: 'bg-red-100 text-red-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-blue-100 text-blue-700' };

function EditableField({ label, value, field, onSave, icon: Icon, type = 'text', options, prefix, bold, color }: { label: string; value: string | number | null; field: string; onSave: (u: Partial<Deal>) => Promise<void>; icon?: React.ElementType; type?: 'text' | 'number' | 'select' | 'date'; options?: string[]; prefix?: string; bold?: boolean; color?: string; }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);
  const commit = async () => { if (draft === String(value ?? '')) { setEditing(false); return; } setSaving(true); const parsed = type === 'number' ? (draft ? parseFloat(draft) : null) : (draft || null); await onSave({ [field]: parsed } as Partial<Deal>); setSaving(false); setEditing(false); };
  const cancel = () => { setDraft(String(value ?? '')); setEditing(false); };
  const display = value != null && value !== '' ? (prefix ? `${prefix}${Number(value).toLocaleString()}` : (type === 'date' ? new Date(String(value)).toLocaleDateString() : String(value))) : '\u2014';
  if (editing) {
    const inputClass = 'px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200 w-full';
    return (<div className="flex items-center text-sm">{Icon && <Icon className="w-4 h-4 mr-2 text-slate-400 shrink-0" />}{type === 'select' ? <select ref={inputRef as React.RefObject<HTMLSelectElement>} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') cancel(); }} disabled={saving} className={inputClass}>{options?.map(o => <option key={o} value={o}>{o}</option>)}</select> : <input ref={inputRef as React.RefObject<HTMLInputElement>} type={type} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }} disabled={saving} className={inputClass} />}</div>);
  }
  return (<div onClick={() => setEditing(true)} className={cn('flex items-center text-sm cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 transition-colors group', bold && 'text-lg font-bold', color)} title="Click to edit">{Icon && <Icon className="w-4 h-4 mr-2 text-slate-400 shrink-0" />}<span className="flex-1">{display}</span><Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" /></div>);
}

function EditablePriority({ value, onSave }: { value: DealPriority; onSave: (u: Partial<Deal>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  if (editing) return (<select ref={ref} value={value} onChange={async e => { await onSave({ priority: e.target.value as DealPriority }); setEditing(false); }} onBlur={() => setEditing(false)} className="px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200"><option>High</option><option>Medium</option><option>Low</option></select>);
  return (<span onClick={() => setEditing(true)} className={cn('px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider cursor-pointer hover:ring-2 hover:ring-sky-200 transition-all group inline-flex items-center gap-1', priorityColors[value])} title="Click to change priority">{value}<Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" /></span>);
}

export default function DealDetail() {
  const { id } = useParams();
  const { deal, isLoading, updateDeal } = useDeal(id);
  const { notes, createNote } = useNotes({ dealId: id });
  const { tasks, createTask, completeTask } = useTasks({ dealId: id });
  const { toast } = useToast();
  const [newNote, setNewNote] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const saveDeal = async (updates: Partial<Deal>) => { await updateDeal(updates); toast('Deal updated'); };

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  if (!deal) return <div className="flex flex-col items-center justify-center h-full text-slate-400"><p>Deal not found</p><Link to="/crm" className="text-sky-500 text-sm mt-2 hover:underline">Back to CRM</Link></div>;

  const contact = deal.contact as { first_name: string; last_name: string; phone: string } | undefined;
  const handleAddNote = async () => { if (!newNote.trim()) return; await createNote(newNote, { dealId: deal.id }); setNewNote(''); };
  const handleAddTask = async () => { if (!newTaskTitle.trim()) return; await createTask({ title: newTaskTitle, deal_id: deal.id, due_at: new Date(Date.now() + 24*60*60*1000).toISOString(), priority: 'Medium', status: 'Pending' }); setNewTaskTitle(''); setShowTaskForm(false); };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/crm" className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5 text-slate-500" /></Link>
        <div className="flex-1"><h1 className="text-2xl font-bold text-slate-900">{deal.title}</h1>{contact && <Link to={`/contacts/${deal.contact_id}`} className="text-sm text-sky-500 hover:text-sky-600 mt-1 inline-block">{contact.first_name} {contact.last_name} · {contact.phone}</Link>}</div>
        <EditablePriority value={deal.priority} onSave={saveDeal} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Deal Information</h2><span className="text-[10px] text-slate-400">Click any value to edit</span></div>
          <div className="space-y-4">
            <EditableField label="Amount" value={deal.amount} field="amount" onSave={saveDeal} icon={DollarSign} type="number" prefix="$" bold color="text-slate-900" />
            <EditableField label="Expected Close" value={deal.expected_close_date} field="expected_close_date" onSave={saveDeal} icon={Calendar} type="date" />
            <div className="flex items-center text-sm text-slate-600"><User className="w-4 h-4 mr-2 text-slate-400" />Source: {deal.lead_source}</div>
            {deal.product_interest && deal.product_interest.length > 0 && <div><p className="text-xs text-slate-400 mb-1">Products of Interest</p><div className="flex flex-wrap gap-1">{deal.product_interest.map(p => <span key={p} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{p}</span>)}</div></div>}
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Notes & Activity</h2>
            <div className="flex space-x-3 mb-4"><input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()} placeholder="Add a note..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" /><button onClick={handleAddNote} className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg font-medium hover:bg-sky-600">Add</button></div>
            <div className="space-y-3 max-h-64 overflow-y-auto">{notes.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No notes yet</p> : notes.map(n => <div key={n.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100"><p className="text-sm text-slate-800">{n.body}</p><p className="text-xs text-slate-400 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p></div>)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Follow-Up Tasks</h2><button onClick={() => setShowTaskForm(true)} className="text-sm text-sky-500 hover:text-sky-600 flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Task</button></div>
            {showTaskForm && <div className="flex space-x-3 mb-4"><input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTask()} placeholder="Follow-up task..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" autoFocus /><button onClick={handleAddTask} className="px-3 py-2 bg-sky-500 text-white text-sm rounded-lg"><Save className="w-4 h-4" /></button><button onClick={() => setShowTaskForm(false)} className="px-3 py-2 text-slate-400"><X className="w-4 h-4" /></button></div>}
            <div className="space-y-2">{tasks.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No follow-up tasks</p> : tasks.map(t => <div key={t.id} className="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-100"><input type="checkbox" checked={t.status === 'Completed'} onChange={() => t.status !== 'Completed' && completeTask(t.id)} className="w-4 h-4 rounded border-slate-300 text-sky-500 mr-3" /><span className={`flex-1 text-sm ${t.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</span><span className="text-xs text-slate-400">{new Date(t.due_at).toLocaleDateString()}</span></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, DollarSign, Calendar, User, AlertCircle, Plus, Save, X, Pencil } from 'lucide-react';
import { useDeal } from '@/hooks/usePipeline';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Deal, DealPriority } from '@/types/database';

const priorityColors: Record<DealPriority, string> = { High: 'bg-red-100 text-red-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-blue-100 text-blue-700' };

// --------------- Reusable inline editable field ---------------
function EditableField({
  label, value, field, onSave, icon: Icon,
  type = 'text', options, prefix, bold, color,
}: {
  label: string; value: string | number | null; field: string;
  onSave: (u: Partial<Deal>) => Promise<void>;
  icon?: React.ElementType;
  type?: 'text' | 'number' | 'select' | 'date'; options?: string[];
  prefix?: string; bold?: boolean; color?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);

  const commit = async () => {
    if (draft === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    const parsed = type === 'number' ? (draft ? parseFloat(draft) : null) : (draft || null);
    await onSave({ [field]: parsed } as Partial<Deal>);
    setSaving(false);
    setEditing(false);
  };

  const cancel = () => { setDraft(String(value ?? '')); setEditing(false); };

  const display = value != null && value !== ''
    ? (prefix ? `${prefix}${Number(value).toLocaleString()}` : (type === 'date' ? new Date(String(value)).toLocaleDateString() : String(value)))
    : '\u2014';

  if (editing) {
    const inputClass = "px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200 w-full";
    return (
      <div className="flex items-center text-sm">
        {Icon && <Icon className="w-4 h-4 mr-2 text-slate-400 shrink-0" />}
        {type === 'select' ? (
          <select ref={inputRef as React.RefObject<HTMLSelectElement>} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') cancel(); }} disabled={saving} className={inputClass}>
            {options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input ref={inputRef as React.RefObject<HTMLInputElement>} type={type} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }} disabled={saving} className={inputClass} />
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={cn(
        "flex items-center text-sm cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 transition-colors group",
        bold && 'text-lg font-bold', color
      )}
      title="Click to edit"
    >
      {Icon && <Icon className="w-4 h-4 mr-2 text-slate-400 shrink-0" />}
      <span className="flex-1">{display}</span>
      <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
    </div>
  );
}

// --------------- Editable priority badge ---------------
function EditablePriority({ value, onSave }: { value: DealPriority; onSave: (u: Partial<Deal>) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <select
        ref={ref} value={value}
        onChange={async e => { await onSave({ priority: e.target.value as DealPriority }); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200"
      >
        <option>High</option><option>Medium</option><option>Low</option>
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn("px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider cursor-pointer hover:ring-2 hover:ring-sky-200 transition-all group inline-flex items-center gap-1", priorityColors[value])}
      title="Click to change priority"
    >
      {value}
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </span>
  );
}

export default function DealDetail() {
  const { id } = useParams();
  const { deal, isLoading, updateDeal } = useDeal(id);
  const { notes, createNote } = useNotes({ dealId: id });
  const { tasks, createTask, completeTask } = useTasks({ dealId: id });
  const [newNote, setNewNote] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  if (!deal) {
    return <div className="flex flex-col items-center justify-center h-full text-slate-400"><p>Deal not found</p><Link to="/crm" className="text-sky-500 text-sm mt-2 hover:underline">Back to CRM</Link></div>;
  }

  const contact = deal.contact as { first_name: string; last_name: string; phone: string } | undefined;

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await createNote(newNote, { dealId: deal.id });
    setNewNote('');
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await createTask({ title: newTaskTitle, deal_id: deal.id, due_at: new Date(Date.now() + 24*60*60*1000).toISOString(), priority: 'Medium', status: 'Pending' });
    setNewTaskTitle('');
    setShowTaskForm(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/crm" className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5 text-slate-500" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{deal.title}</h1>
          {contact && (
            <Link to={`/contacts/${deal.contact_id}`} className="text-sm text-sky-500 hover:text-sky-600 mt-1 inline-block">
              {contact.first_name} {contact.last_name} · {contact.phone}
            </Link>
          )}
        </div>
        <EditablePriority value={deal.priority} onSave={updateDeal} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Deal Information</h2>
            <span className="text-[10px] text-slate-400">Click any value to edit</span>
          </div>
          <div className="space-y-4">
            <EditableField label="Amount" value={deal.amount} field="amount" onSave={updateDeal} icon={DollarSign} type="number" prefix="$" bold color="text-slate-900" />
            <EditableField label="Expected Close" value={deal.expected_close_date} field="expected_close_date" onSave={updateDeal} icon={Calendar} type="date" />
            <div className="flex items-center text-sm text-slate-600"><User className="w-4 h-4 mr-2 text-slate-400" />Source: {deal.lead_source}</div>
            {deal.product_interest && deal.product_interest.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Products of Interest</p>
                <div className="flex flex-wrap gap-1">{deal.product_interest.map(p => <span key={p} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{p}</span>)}</div>
              </div>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Notes & Activity</h2>
            <div className="flex space-x-3 mb-4">
              <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()} placeholder="Add a note..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <button onClick={handleAddNote} className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg font-medium hover:bg-sky-600">Add</button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No notes yet</p> : notes.map(n => (
                <div key={n.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-800">{n.body}</p>
                  <p className="text-xs text-slate-400 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Follow-Up Tasks</h2>
              <button onClick={() => setShowTaskForm(true)} className="text-sm text-sky-500 hover:text-sky-600 flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Task</button>
            </div>
            {showTaskForm && (
              <div className="flex space-x-3 mb-4">
                <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTask()} placeholder="Follow-up task..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" autoFocus />
                <button onClick={handleAddTask} className="px-3 py-2 bg-sky-500 text-white text-sm rounded-lg"><Save className="w-4 h-4" /></button>
                <button onClick={() => setShowTaskForm(false)} className="px-3 py-2 text-slate-400"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div className="space-y-2">
              {tasks.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No follow-up tasks</p> : tasks.map(t => (
                <div key={t.id} className="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <input type="checkbox" checked={t.status === 'Completed'} onChange={() => t.status !== 'Completed' && completeTask(t.id)} className="w-4 h-4 rounded border-slate-300 text-sky-500 mr-3" />
                  <span className={`flex-1 text-sm ${t.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</span>
                  <span className="text-xs text-slate-400">{new Date(t.due_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, DollarSign, Calendar, User, AlertCircle, Plus, Save, X } from 'lucide-react';
import { useDeal } from '@/hooks/usePipeline';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export default function DealDetail() {
  const { id } = useParams();
  const { deal, isLoading, updateDeal } = useDeal(id);
  const { notes, createNote } = useNotes({ dealId: id });
  const { tasks, createTask, completeTask } = useTasks({ dealId: id });
  const [newNote, setNewNote] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  if (!deal) {
    return <div className="flex flex-col items-center justify-center h-full text-slate-400"><p>Deal not found</p><Link to="/crm" className="text-sky-500 text-sm mt-2 hover:underline">Back to CRM</Link></div>;
  }

  const contact = deal.contact as { first_name: string; last_name: string; phone: string } | undefined;

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await createNote(newNote, { dealId: deal.id });
    setNewNote('');
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await createTask({ title: newTaskTitle, deal_id: deal.id, due_at: new Date(Date.now() + 24*60*60*1000).toISOString(), priority: 'Medium', status: 'Pending' });
    setNewTaskTitle('');
    setShowTaskForm(false);
  };

  const priorityColors = { High: 'bg-red-100 text-red-700', Medium: 'bg-amber-100 text-amber-700', Low: 'bg-blue-100 text-blue-700' };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/crm" className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5 text-slate-500" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{deal.title}</h1>
          {contact && (
            <Link to={`/contacts/${deal.contact_id}`} className="text-sm text-sky-500 hover:text-sky-600 mt-1 inline-block">
              {contact.first_name} {contact.last_name} · {contact.phone}
            </Link>
          )}
        </div>
        <span className={cn("px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wider", priorityColors[deal.priority])}>{deal.priority}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Deal Information</h2>
          <div className="space-y-4">
            <div className="flex items-center"><DollarSign className="w-4 h-4 text-slate-400 mr-2" /><span className="text-lg font-bold text-slate-900">${deal.amount?.toLocaleString() ?? '0'}</span></div>
            {deal.expected_close_date && <div className="flex items-center text-sm text-slate-600"><Calendar className="w-4 h-4 mr-2 text-slate-400" />Expected close: {new Date(deal.expected_close_date).toLocaleDateString()}</div>}
            <div className="flex items-center text-sm text-slate-600"><User className="w-4 h-4 mr-2 text-slate-400" />Source: {deal.lead_source}</div>
            {deal.product_interest && deal.product_interest.length > 0 && (
              <div>
                <p className="text-xs text-slate-400 mb-1">Products of Interest</p>
                <div className="flex flex-wrap gap-1">{deal.product_interest.map(p => <span key={p} className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs">{p}</span>)}</div>
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <label className="text-xs text-slate-400">Priority</label>
            <select value={deal.priority} onChange={e => updateDeal({ priority: e.target.value as 'High' | 'Medium' | 'Low' })} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
              <option>High</option><option>Medium</option><option>Low</option>
            </select>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Notes & Activity</h2>
            <div className="flex space-x-3 mb-4">
              <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()} placeholder="Add a note..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <button onClick={handleAddNote} className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg font-medium hover:bg-sky-600">Add</button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No notes yet</p> : notes.map(n => (
                <div key={n.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <p className="text-sm text-slate-800">{n.body}</p>
                  <p className="text-xs text-slate-400 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Follow-Up Tasks</h2>
              <button onClick={() => setShowTaskForm(true)} className="text-sm text-sky-500 hover:text-sky-600 flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Task</button>
            </div>
            {showTaskForm && (
              <div className="flex space-x-3 mb-4">
                <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTask()} placeholder="Follow-up task..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" autoFocus />
                <button onClick={handleAddTask} className="px-3 py-2 bg-sky-500 text-white text-sm rounded-lg"><Save className="w-4 h-4" /></button>
                <button onClick={() => setShowTaskForm(false)} className="px-3 py-2 text-slate-400"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div className="space-y-2">
              {tasks.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No follow-up tasks</p> : tasks.map(t => (
                <div key={t.id} className="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <input type="checkbox" checked={t.status === 'Completed'} onChange={() => t.status !== 'Completed' && completeTask(t.id)} className="w-4 h-4 rounded border-slate-300 text-sky-500 mr-3" />
                  <span className={`flex-1 text-sm ${t.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</span>
                  <span className="text-xs text-slate-400">{new Date(t.due_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
