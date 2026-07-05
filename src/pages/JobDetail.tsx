import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, User, Wrench, Plus, Save, X, Pencil, DollarSign } from 'lucide-react';
import { useJob, statusColors, JOB_STATUS_OPTIONS, JOB_TYPE_OPTIONS } from '@/hooks/useServiceJobs';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { JobStatus, JobType, Job } from '@/types/database';
import { useToast } from '@/components/ui/Toast';

// --------------- Reusable inline editable field ---------------
function EditableField({
  label, value, field, onSave, icon: Icon,
  type = 'text', options, prefix, bold, color, multiline,
}: {
  label: string; value: string | number | null; field: string;
  onSave: (u: Partial<Job>) => Promise<boolean>;
  icon?: React.ElementType;
  type?: 'text' | 'number' | 'select' | 'datetime-local'; options?: string[];
  prefix?: string; bold?: boolean; color?: string; multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);

  const commit = async () => {
    if (draft === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    const parsed = type === 'number' ? (draft ? parseFloat(draft) : null) : (draft || null);
    await onSave({ [field]: parsed } as Partial<Job>);
    setSaving(false);
    setEditing(false);
  };

  const cancel = () => { setDraft(String(value ?? '')); setEditing(false); };

  const display = value != null && value !== ''
    ? (prefix ? `${prefix}${Number(value).toLocaleString()}` : String(value))
    : '\u2014';

  if (editing) {
    const inputClass = "px-2 py-1 border border-brand-500 rounded-lg text-sm outline-none bg-ink-900 focus:ring-2 focus:ring-brand-500/30 w-full";
    return (
      <div className="flex items-center text-sm">
        {Icon && <Icon className="w-4 h-4 mr-2 text-ink-500 shrink-0" />}
        {type === 'select' ? (
          <select ref={inputRef as React.RefObject<HTMLSelectElement>} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') cancel(); }} disabled={saving} className={inputClass}>
            {options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : multiline ? (
          <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === 'Escape') cancel(); }} disabled={saving} rows={3} className={cn(inputClass, 'resize-none')} />
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
        "flex items-center text-sm cursor-pointer rounded px-1 py-0.5 -mx-1 hover:bg-brand-500/10 hover:ring-1 hover:ring-brand-500/30 transition-colors group",
        bold && 'text-lg font-bold', color
      )}
      title="Click to edit"
    >
      {Icon && <Icon className="w-4 h-4 mr-2 text-ink-500 shrink-0" />}
      <span className="flex-1">{display}</span>
      <Pencil className="w-3 h-3 text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1" />
    </div>
  );
}

// --------------- Editable status badge ---------------
function EditableStatusBadge({ value, onSave }: { value: JobStatus; onSave: (u: Partial<Job>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);
  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  if (editing) {
    return (
      <select
        ref={ref} value={value}
        onChange={async e => { await onSave({ status: e.target.value as JobStatus }); setEditing(false); }}
        onBlur={() => setEditing(false)}
        className="px-2 py-1 border border-brand-500 rounded-lg text-sm outline-none bg-ink-900 focus:ring-2 focus:ring-brand-500/30"
      >
        {JOB_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn("px-3 py-1 rounded-lg text-sm font-bold border-l-4 cursor-pointer hover:ring-2 hover:ring-brand-500/30 transition-all group inline-flex items-center gap-1", statusColors[value] ?? 'bg-ink-950')}
      title="Click to change status"
    >
      {value}
      <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
    </span>
  );
}

export default function JobDetail() {
  const { id } = useParams();
  const { job, isLoading, updateJob } = useJob(id);
  const { notes, createNote } = useNotes({ jobId: id });
  const { tasks, createTask, completeTask } = useTasks({ jobId: id });
  const { toast } = useToast();
  const [newNote, setNewNote] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const saveJob = async (updates: Partial<Job>) => {
    const ok = await updateJob(updates);
    toast(ok ? 'Job updated' : 'Failed to save', ok ? 'success' : 'error');
    return ok;
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  }

  if (!job) {
    return <div className="flex flex-col items-center justify-center h-full text-ink-500"><p>Job not found</p><Link to="/service" className="text-brand-400 text-sm mt-2 hover:underline">Back to Service</Link></div>;
  }

  const contact = (job as unknown as Record<string, unknown>).contacts as { first_name: string; last_name: string; phone: string } | undefined;
  const property = (job as unknown as Record<string, unknown>).properties as { address: string } | undefined;
  const location = (job as unknown as Record<string, unknown>).locations as { name: string } | undefined;

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await createNote(newNote, { jobId: job.id });
    setNewNote('');
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) return;
    await createTask({ title: newTaskTitle, job_id: job.id, due_at: new Date(Date.now() + 24*60*60*1000).toISOString(), priority: 'Medium', status: 'Pending' });
    setNewTaskTitle('');
    setShowTaskForm(false);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/service" className="p-2 hover:bg-ink-800 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5 text-ink-400" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-ink-100">{job.title}</h1>
          {contact && <Link to={`/contacts/${job.contact_id}`} className="text-sm text-brand-400 hover:text-brand-400">{contact.first_name} {contact.last_name}</Link>}
        </div>
        <EditableStatusBadge value={job.status as JobStatus} onSave={saveJob} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">Job Details</h2>
            <span className="text-[10px] text-ink-500">Click any value to edit</span>
          </div>
          <div className="space-y-4">
            <EditableField label="Job Type" value={job.job_type} field="job_type" onSave={saveJob} icon={Wrench} type="select" options={JOB_TYPE_OPTIONS} />
            {location && <div className="flex items-center text-sm"><MapPin className="w-4 h-4 mr-2 text-ink-500" />{location.name}</div>}
            {property && <EditableField label="Address" value={property.address} field="address" onSave={saveJob} icon={MapPin} />}
            <EditableField label="Scheduled" value={job.scheduled_at ? new Date(job.scheduled_at).toISOString().slice(0, 16) : null} field="scheduled_at" onSave={saveJob} icon={Clock} type="datetime-local" />
            {job.estimated_duration && <div className="text-sm text-ink-300">Duration: {job.estimated_duration} min</div>}
            {job.description && <div className="text-sm text-ink-300 bg-ink-950 p-3 rounded-lg">{job.description}</div>}
            <EditableField label="Collect" value={job.amount_to_collect} field="amount_to_collect" onSave={saveJob} icon={DollarSign} type="number" prefix="$" bold color="text-emerald-400" />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider mb-4">Job Notes</h2>
            <div className="flex space-x-3 mb-4">
              <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()} placeholder="Add a note..." className="flex-1 px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" />
              <button onClick={handleAddNote} className="px-4 py-2 bg-brand-500 text-white text-sm rounded-lg font-medium hover:bg-brand-600">Add</button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.length === 0 ? <p className="text-sm text-ink-500 text-center py-4">No notes yet</p> : notes.map(n => (
                <div key={n.id} className="p-3 bg-ink-950 rounded-lg border border-ink-800"><p className="text-sm text-ink-100">{n.body}</p><p className="text-xs text-ink-500 mt-1">{n.author_name} Â· {new Date(n.created_at).toLocaleDateString()}</p></div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">Tasks</h2>
              <button onClick={() => setShowTaskForm(true)} className="text-sm text-brand-400 hover:text-brand-400 flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Task</button>
            </div>
            {showTaskForm && (
              <div className="flex space-x-3 mb-4">
                <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTask()} placeholder="Task..." className="flex-1 px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" autoFocus />
                <button onClick={handleAddTask} className="px-3 py-2 bg-brand-500 text-white text-sm rounded-lg"><Save className="w-4 h-4" /></button>
                <button onClick={() => setShowTaskForm(false)} className="px-3 py-2 text-ink-500"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div className="space-y-2">
              {tasks.length === 0 ? <p className="text-sm text-ink-500 text-center py-4">No tasks</p> : tasks.map(t => (
                <div key={t.id} className="flex items-center p-3 bg-ink-950 rounded-lg border border-ink-800">
                  <input type="checkbox" checked={t.status === 'Completed'} onChange={() => t.status !== 'Completed' && completeTask(t.id)} className="w-4 h-4 rounded border-ink-600 text-brand-400 mr-3" />
                  <span className={`flex-1 text-sm ${t.status === 'Completed' ? 'line-through text-ink-500' : 'text-ink-100'}`}>{t.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
