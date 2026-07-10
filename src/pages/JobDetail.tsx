import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Wrench, Plus, Save, X, Pencil, DollarSign, Play, Square, Camera, Trash2 } from 'lucide-react';
import { useJob, statusColors, JOB_STATUS_OPTIONS, JOB_TYPE_OPTIONS } from '@/hooks/useServiceJobs';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useTimeClock, formatDuration } from '@/hooks/useTimeClock';
import { useJobPhotos, PHOTO_TYPES, type JobPhoto } from '@/hooks/useJobPhotos';
import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import type { JobStatus, JobType, Job } from '@/types/database';
import { useToast } from '@/components/ui/Toast';

// ─── Time clock: big start/stop, built for gloved thumbs ───
function TimeClockCard({ jobId }: { jobId: string }) {
  const { activeEntry, isWorking, start, stop, totalMinutes, entries } = useTimeClock(jobId);
  const { toast } = useToast();
  const [now, setNow] = useState(() => Date.now());

  // live elapsed ticker while on the clock
  useEffect(() => {
    if (!activeEntry) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeEntry]);

  const elapsedMs = activeEntry ? now - new Date(activeEntry.started_at).getTime() : 0;
  const hh = String(Math.floor(elapsedMs / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((elapsedMs % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((elapsedMs % 60000) / 1000)).padStart(2, '0');

  const handleToggle = async () => {
    const { error } = activeEntry ? await stop() : await start();
    if (error) toast(error, 'error');
    else toast(activeEntry ? 'Clocked out — time logged' : 'On the clock', 'success');
  };

  return (
    <div className={cn(
      'rounded-xl border p-4 sm:p-5 flex items-center justify-between gap-4',
      activeEntry ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-ink-700 bg-ink-900'
    )}>
      <div className="min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-ink-500 mb-1">Time Clock</p>
        {activeEntry ? (
          <p className="font-mono text-[26px] font-bold text-emerald-400 leading-none tabular-nums">{hh}:{mm}:{ss}</p>
        ) : (
          <p className="text-sm text-ink-400">
            {totalMinutes > 0 ? `${formatDuration(totalMinutes)} logged · ${entries.filter(e => e.ended_at).length} session${entries.filter(e => e.ended_at).length === 1 ? '' : 's'}` : 'Not started'}
          </p>
        )}
      </div>
      <button
        onClick={handleToggle}
        disabled={isWorking}
        className={cn(
          'flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-colors shrink-0 disabled:opacity-50',
          activeEntry ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-white'
        )}
      >
        {activeEntry ? <><Square className="w-4 h-4 fill-current" />Stop Job</> : <><Play className="w-4 h-4 fill-current" />Start Job</>}
      </button>
    </div>
  );
}

// ─── Photos: camera-first capture with type tags ───
function PhotoCard({ jobId }: { jobId: string }) {
  const { photos, isUploading, uploadPhoto, deletePhoto } = useJobPhotos(jobId);
  const { toast } = useToast();
  const [photoType, setPhotoType] = useState<string>('General');
  const [viewer, setViewer] = useState<JobPhoto | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const { error } = await uploadPhoto(file, photoType);
      if (error) { toast(`Upload failed: ${error}`, 'error'); return; }
    }
    toast(`Photo${files.length > 1 ? 's' : ''} added`, 'success');
  };

  return (
    <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-ink-400 uppercase tracking-wider">Photos</h2>
        <div className="flex items-center gap-2">
          <select
            value={photoType}
            onChange={e => setPhotoType(e.target.value)}
            className="bg-ink-950 border border-ink-700 text-xs text-ink-300 rounded-lg px-2 py-2 outline-none focus:border-brand-500"
          >
            {PHOTO_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            <Camera className="w-4 h-4" />{isUploading ? 'Uploading…' : 'Add Photo'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
          />
        </div>
      </div>

      {photos.length === 0 ? (
        <p className="text-sm text-ink-500 text-center py-6">No photos yet — proof of delivery, damage, serial numbers</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photos.map(p => (
            <button key={p.id} onClick={() => setViewer(p)} className="relative aspect-square rounded-lg overflow-hidden border border-ink-700 group">
              <img src={p.url} alt={p.photo_type} loading="lazy" className="w-full h-full object-cover" />
              <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] font-semibold text-ink-300 px-1.5 py-0.5 truncate">{p.photo_type}</span>
            </button>
          ))}
        </div>
      )}

      {/* Full-size viewer */}
      {viewer && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4" onClick={() => setViewer(null)}>
          <img src={viewer.url} alt={viewer.photo_type} className="max-w-full max-h-[80vh] rounded-lg object-contain" />
          <div className="flex items-center gap-4 mt-4" onClick={e => e.stopPropagation()}>
            <span className="text-sm text-ink-300">{viewer.photo_type} · {new Date(viewer.created_at).toLocaleString()}</span>
            <button
              onClick={async () => { const { error } = await deletePhoto(viewer); if (error) toast(error, 'error'); else { toast('Photo deleted', 'success'); setViewer(null); } }}
              className="flex items-center gap-1 text-sm text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />Delete
            </button>
            <button onClick={() => setViewer(null)} className="text-sm text-ink-400 hover:text-ink-100">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

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
          <h1 className="text-xl sm:text-2xl font-bold text-ink-100">{job.title}</h1>
          {contact && <Link to={`/customers/${job.contact_id}`} className="text-sm text-brand-400 hover:text-brand-400">{contact.first_name} {contact.last_name}</Link>}
        </div>
        <EditableStatusBadge value={job.status as JobStatus} onSave={saveJob} />
      </div>

      {/* Field capture: time clock front and center for techs */}
      <TimeClockCard jobId={job.id} />

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
          {/* Photos: proof of delivery, damage, serials */}
          <PhotoCard jobId={job.id} />

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
