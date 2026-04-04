import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, User, Wrench, Plus, Save, X } from 'lucide-react';
import { useJob, statusColors } from '@/hooks/useServiceJobs';
import { useNotes } from '@/hooks/useNotes';
import { useTasks } from '@/hooks/useTasks';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { JobStatus } from '@/types/database';

export default function JobDetail() {
  const { id } = useParams();
  const { job, isLoading } = useJob(id);
  const { notes, createNote } = useNotes({ jobId: id });
  const { tasks, createTask, completeTask } = useTasks({ jobId: id });
  const [newNote, setNewNote] = useState('');
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  if (!job) {
    return <div className="flex flex-col items-center justify-center h-full text-slate-400"><p>Job not found</p><Link to="/service" className="text-sky-500 text-sm mt-2 hover:underline">Back to Service</Link></div>;
  }

  const contact = (job as Record<string, unknown>).contacts as { first_name: string; last_name: string; phone: string } | undefined;
  const property = (job as Record<string, unknown>).properties as { address: string } | undefined;
  const location = (job as Record<string, unknown>).locations as { name: string } | undefined;

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
        <Link to="/service" className="p-2 hover:bg-slate-100 rounded-lg transition-colors"><ArrowLeft className="w-5 h-5 text-slate-500" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{job.title}</h1>
          {contact && <Link to={`/contacts/${job.contact_id}`} className="text-sm text-sky-500 hover:text-sky-600">{contact.first_name} {contact.last_name}</Link>}
        </div>
        <span className={cn("px-3 py-1 rounded-lg text-sm font-bold border-l-4", statusColors[job.status as JobStatus] ?? 'bg-slate-100')}>{job.status}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Job Details</h2>
          <div className="space-y-4">
            <div className="flex items-center text-sm"><Wrench className="w-4 h-4 mr-2 text-slate-400" />{job.job_type}</div>
            {location && <div className="flex items-center text-sm"><MapPin className="w-4 h-4 mr-2 text-slate-400" />{location.name}</div>}
            {property && <div className="flex items-center text-sm text-slate-600"><MapPin className="w-4 h-4 mr-2 text-slate-400" />{property.address}</div>}
            {job.scheduled_at && <div className="flex items-center text-sm"><Clock className="w-4 h-4 mr-2 text-slate-400" />{new Date(job.scheduled_at).toLocaleString()}</div>}
            {job.estimated_duration && <div className="text-sm text-slate-600">Duration: {job.estimated_duration} min</div>}
            {job.description && <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg">{job.description}</div>}
            {job.amount_to_collect && <div className="text-lg font-bold text-emerald-600">Collect: ${job.amount_to_collect.toLocaleString()}</div>}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {/* Notes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Job Notes</h2>
            <div className="flex space-x-3 mb-4">
              <input value={newNote} onChange={e => setNewNote(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddNote()} placeholder="Add a note..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <button onClick={handleAddNote} className="px-4 py-2 bg-sky-500 text-white text-sm rounded-lg font-medium hover:bg-sky-600">Add</button>
            </div>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {notes.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No notes yet</p> : notes.map(n => (
                <div key={n.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100"><p className="text-sm text-slate-800">{n.body}</p><p className="text-xs text-slate-400 mt-1">{n.author_name} · {new Date(n.created_at).toLocaleDateString()}</p></div>
              ))}
            </div>
          </div>

          {/* Tasks */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Tasks</h2>
              <button onClick={() => setShowTaskForm(true)} className="text-sm text-sky-500 hover:text-sky-600 flex items-center"><Plus className="w-4 h-4 mr-1" /> Add Task</button>
            </div>
            {showTaskForm && (
              <div className="flex space-x-3 mb-4">
                <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddTask()} placeholder="Task..." className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" autoFocus />
                <button onClick={handleAddTask} className="px-3 py-2 bg-sky-500 text-white text-sm rounded-lg"><Save className="w-4 h-4" /></button>
                <button onClick={() => setShowTaskForm(false)} className="px-3 py-2 text-slate-400"><X className="w-4 h-4" /></button>
              </div>
            )}
            <div className="space-y-2">
              {tasks.length === 0 ? <p className="text-sm text-slate-400 text-center py-4">No tasks</p> : tasks.map(t => (
                <div key={t.id} className="flex items-center p-3 bg-slate-50 rounded-lg border border-slate-100">
                  <input type="checkbox" checked={t.status === 'Completed'} onChange={() => t.status !== 'Completed' && completeTask(t.id)} className="w-4 h-4 rounded border-slate-300 text-sky-500 mr-3" />
                  <span className={`flex-1 text-sm ${t.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{t.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
