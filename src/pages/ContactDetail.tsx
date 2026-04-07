import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Phone, Mail, MapPin, Plus, Save, X, Pencil } from 'lucide-react';
import { useContact } from '@/hooks/useContacts';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { Contact, ContactType } from '@/types/database';
import { useToast } from '@/components/ui/Toast';

const CONTACT_TYPE_OPTIONS: ContactType[] = ['Lead', 'Prospect', 'Customer', 'Past Customer'];
const TYPE_COLORS: Record<ContactType, string> = {
  Customer: 'bg-emerald-100 text-emerald-800',
  Lead: 'bg-amber-100 text-amber-800',
  Prospect: 'bg-blue-100 text-blue-800',
  'Past Customer': 'bg-slate-100 text-slate-600',
};

function EditableTypeBadge({ value, onSave }: { value: ContactType; onSave: (u: Partial<Contact>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  if (editing) {
    return (
      <select ref={ref} value={value} onChange={async e => { await onSave({ customer_type: e.target.value as ContactType }); setEditing(false); }} onBlur={() => setEditing(false)} className="px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200">
        {CONTACT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    );
  }
  return (
    <span onClick={() => setEditing(true)} className={cn('px-3 py-1 rounded-full text-sm font-medium cursor-pointer hover:ring-2 hover:ring-sky-200 transition-all group inline-flex items-center gap-1', TYPE_COLORS[value] ?? 'bg-slate-100 text-slate-800')} title="Click to change type">
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
      <dt className="text-xs font-medium text-slate-400 mb-0.5">{label}</dt>
      {editing ? (
        <input ref={inputRef} type={type} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }} disabled={saving} className="px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200 w-full" />
      ) : (
        <dd onClick={() => setEditing(true)} className="text-sm text-slate-800 cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 transition-colors group inline-flex items-center gap-1" title="Click to edit">
          {value || '\u2014'}<Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </dd>
      )}
    </div>
  );
}

export default function ContactDetail() {
  const { id } = useParams();
  const { contact, isLoading, updateContact } = useContact(id);
  const { notes, createNote } = useNotes({ contactId: id });
  const { tasks, createTask, completeTask } = useTasks({ contactId: id });
  const { toast } = useToast();
  const [newNote, setNewNote] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const saveContact = async (updates: Partial<Contact>) => {
    const ok = await updateContact(updates);
    toast(ok ? 'Contact updated' : 'Failed to save', ok ? 'success' : 'error');
    return ok;
  };

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  if (!contact) return <div className="flex flex-col items-center justify-center h-full text-slate-400"><p className="text-lg">Contact not found</p><Link to="/contacts" className="text-sky-500 text-sm mt-2 hover:underline">Back to Contacts</Link></div>;

  const handleAddNote = async () => { if (!newNote.trim()) return; await createNote(newNote, { contactId: contact.id }); setNewNote(''); };
  const handleAddTask = async () => { if (!newTaskTitle.trim()) return; await createTask({ title: newTaskTitle, contact_id: contact.id, due_at: new Date(Date.now() + 24*60*60*1000).toISOString(), priority: 'Medium', status: 'Pending' }); setNewTaskTitle(''); setShowTaskForm(false); };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/contacts" className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5 text-slate-500" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{contact.first_name} {contact.last_name}</h1>
          <div className="flex items-center space-x-4 mt-1 text-sm text-slate-500">
            <span className="flex items-center"><Phone className="w-3.5 h-3.5 mr-1" />{contact.phone}</span>
            {contact.email && <span className="flex items-center"><Mail className="w-3.5 h-3.5 mr-1" />{contact.email}</span>}
          </div>
        </div>
        <EditableTypeBadge value={contact.customer_type} onSave={saveContact} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Contact Details</h2><span className="text-[10px] text-slate-400">Click any value to edit</span></div>
          <div className="space-y-4">
            <EditableDetailRow label="Phone" value={contact.phone} field="phone" onSave={saveContact} type="tel" />
            <EditableDetailRow label="Secondary Phone" value={contact.phone_secondary} field="phone_secondary" onSave={saveContact} type="tel" />
            <EditableDetailRow label="Email" value={contact.email} field="email" onSave={saveContact} type="email" />
            <EditableDetailRow label="Address" value={contact.mailing_address} field="mailing_address" onSave={saveContact} />
            <div><dt className="text-xs font-medium text-slate-400 mb-0.5">Lead Source</dt><dd className="text-sm text-slate-800">{contact.lead_source}</dd></div>
            <div><dt className="text-xs font-medium text-slate-400 mb-0.5">Tags</dt><dd className="text-sm text-slate-800">{contact.tags?.join(', ') || '\u2014'}</dd></div>
            <div><dt className="text-xs font-medium text-slate-400 mb-0.5">Created</dt><dd className="text-sm text-slate-800">{new Date(contact.created_at).toLocaleDateString()}</dd></div>
          </div>
        </div>
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Notes</h2>
            <div className="flex space-x-3 mb-4"><input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()} placeholder="Add a note..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" /><button onClick={handleAddNote} className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg font-medium hover:bg-sky-600">Add</button></div>
            <div className="space-y-3 max-h-80 overflow-y-auto">{notes.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No notes yet</p> : notes.map(n => <div key={n.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100"><p className="text-sm text-slate-800">{n.body}</p><p className="text-xs text-slate-400 mt-1">{n.author_name} Â· {new Date(n.created_at).toLocaleDateString()}</p></div>)}</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4"><h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Tasks</h2><button onClick={() => setShowTaskForm(true)} className="text-sm text-sky-500 hover:text-sky-600 flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Task</button></div>
            {showTaskForm && <div className="flex space-x-3 mb-4"><input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTask()} placeholder="Task title..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" autoFocus /><button onClick={handleAddTask} className="px-3 py-2 bg-sky-500 text-white text-sm rounded-lg"><Save className="w-4 h-4" /></button><button onClick={() => setShowTaskForm(false)} className="px-3 py-2 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button></div>}
            <div className="space-y-2">{tasks.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No tasks yet</p> : tasks.map(t => <div key={t.id} className="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-100"><input type="checkbox" checked={t.status === 'Completed'} onChange={() => t.status !== 'Completed' && completeTask(t.id)} className="w-4 h-4 rounded border-slate-300 text-sky-500 mr-3" /><span className={`flex-1 text-sm ${t.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</span><span className="text-xs text-slate-400">{new Date(t.due_at).toLocaleDateString()}</span></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
