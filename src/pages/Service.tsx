import { Calendar as CalendarIcon, Clock, MapPin, User, Plus, Filter, X, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useServiceJobs, statusColors, JOB_STATUS_OPTIONS } from '@/hooks/useServiceJobs';
import { useContacts } from '@/hooks/useContacts';
import { useAuth } from '@/contexts/AuthContext';
import type { JobStatus, JobType } from '@/types/database';
import { useToast } from '@/components/ui/Toast';

// --------------- Inline editable job status badge ---------------
function EditableJobStatus({ value, jobId, onSave }: { value: JobStatus; jobId: string; onSave: (id: string, u: { status: JobStatus }) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = async (v: string) => {
    if (v !== value) await onSave(jobId, { status: v as JobStatus });
    setEditing(false);
  };

  if (editing) {
    return (
      <select
        ref={ref}
        value={value}
        onChange={e => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        onClick={e => e.preventDefault()}
        className="px-2 py-1 border border-sky-400 rounded-lg text-xs outline-none bg-white focus:ring-2 focus:ring-sky-200 relative z-10"
      >
        {JOB_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }

  return (
    <span
      onClick={e => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
      className="text-xs font-bold uppercase tracking-wider opacity-80 cursor-pointer hover:opacity-100 inline-flex items-center gap-1 group"
      title="Click to change status"
    >
      {value}
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </span>
  );
}

export default function Service() {
  const { unscheduledJobs, scheduledJobs, isLoading, createJob, updateJob } = useServiceJobs();
  const { contacts } = useContacts();
  const { locations } = useAuth();
  const { toast } = useToast();
  const todayDisplay = format(new Date(), 'MMMM d, yyyy');

  const saveJobStatus = async (id: string, u: { status: JobStatus }) => {
    const ok = await updateJob(id, u);
    toast(ok ? `Status â ${u.status}` : 'Failed to update', ok ? 'success' : 'error');
    return ok;
  };
  const [showCreate, setShowCreate] = useState(false);
  const [newJob, setNewJob] = useState({
    title: '', contact_id: '', location_id: '',
    job_type: 'Repair' as JobType,
    status: 'In Progress' as JobStatus,
    description: '', scheduled_at: '',
    priority: 'Medium' as 'High' | 'Medium' | 'Low',
    amount_to_collect: '',
  });

  const handleCreate = async () => {
    await createJob({
      title: newJob.title,
      contact_id: newJob.contact_id,
      location_id: newJob.location_id || (locations[0]?.id ?? ''),
      job_type: newJob.job_type,
      status: newJob.status,
      description: newJob.description || null,
      scheduled_at: newJob.scheduled_at || null,
      priority: newJob.priority,
      amount_to_collect: newJob.amount_to_collect ? parseFloat(newJob.amount_to_collect) : null,
    });
    setShowCreate(false);
    setNewJob({ title: '', contact_id: '', location_id: '', job_type: 'Repair', status: 'In Progress', description: '', scheduled_at: '', priority: 'Medium', amount_to_collect: '' });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Service & Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">Schedule and dispatch technicians &mdash; click any status to change it</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Filter className="w-4 h-4 mr-2" />Filter</button>
          <button onClick={() => setShowCreate(true)} className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Plus className="w-4 h-4 mr-2" />New Job</button>
        </div>
      </div>
      {/* Create Job Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">New Job</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Job Title *" value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <select value={newJob.contact_id} onChange={e => setNewJob({...newJob, contact_id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                <option value="">Select Customer *</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} \u2014 {c.phone}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select value={newJob.job_type} onChange={e => setNewJob({...newJob, job_type: e.target.value as JobType})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>Delivery</option><option>Repair</option><option>Installation</option><option>Warranty</option><option>Maintenance</option><option>Pickup</option>
                </select>
                <select value={newJob.status} onChange={e => setNewJob({...newJob, status: e.target.value as JobStatus})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>In Progress</option><option>Delivery</option><option>Parts on Order</option><option>Warranty</option><option>Ready for Pickup</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={newJob.location_id} onChange={e => setNewJob({...newJob, location_id: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="">Location *</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={newJob.priority} onChange={e => setNewJob({...newJob, priority: e.target.value as 'High' | 'Medium' | 'Low'})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
              </div>
              <input type="datetime-local" value={newJob.scheduled_at} onChange={e => setNewJob({...newJob, scheduled_at: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <input placeholder="Amount to Collect ($)" type="number" value={newJob.amount_to_collect} onChange={e => setNewJob({...newJob, amount_to_collect: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <textarea placeholder="Description / Notes" value={newJob.description} onChange={e => setNewJob({...newJob, description: e.target.value})} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400 resize-none" />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newJob.title || !newJob.contact_id || !newJob.location_id} className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:opacity-50">Create Job</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden gap-6">
        {/* Unscheduled Queue */}
        <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Unscheduled Queue</h2>
            <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">{unscheduledJobs.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {unscheduledJobs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No unscheduled jobs</p>
            ) : unscheduledJobs.map(job => (
              <div key={job.id} className={cn("block p-3 rounded-r-lg border border-l-4 shadow-sm hover:shadow-md transition-all", statusColors[job.status as JobStatus] ?? 'bg-slate-50')}>
                <EditableJobStatus value={job.status as JobStatus} jobId={job.id} onSave={saveJobStatus} />
                <Link to={`/service/${job.id}`} className="block">
                  <h3 className="font-medium text-sm mb-2 leading-tight hover:text-sky-700">{job.title}</h3>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule Board */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="flex items-center space-x-4">
              <h2 className="font-semibold text-slate-800 flex items-center"><CalendarIcon className="w-5 h-5 mr-2 text-slate-500" />Today's Schedule</h2>
              <div className="text-sm text-slate-500">{todayDisplay}</div>
            </div>
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button className="px-3 py-1 text-sm font-medium bg-white shadow-sm rounded-md text-slate-800">Day</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Week</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Month</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            <div className="space-y-4">
              {scheduledJobs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No jobs scheduled today</p>
              ) : scheduledJobs.map(job => (
                <div key={job.id} className={cn("block p-4 rounded-r-lg border border-l-4 shadow-sm bg-white hover:shadow-md transition-all", statusColors[job.status as JobStatus] ?? 'bg-slate-50')}>
                  <EditableJobStatus value={job.status as JobStatus} jobId={job.id} onSave={saveJobStatus} />
                  <Link to={`/service/${job.id}`} className="block">
                    <h3 className="font-medium text-slate-900 hover:text-sky-700">{job.title}</h3>
                    <div className="flex items-center space-x-4 mt-2 text-sm opacity-80">
                      {job.scheduled_at && <span className="flex items-center"><Clock className="w-4 h-4 mr-1" />{new Date(job.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import { Calendar as CalendarIcon, Clock, MapPin, User, Plus, Filter, X, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useServiceJobs, statusColors, JOB_STATUS_OPTIONS } from '@/hooks/useServiceJobs';
import { useContacts } from '@/hooks/useContacts';
import { useAuth } from '@/contexts/AuthContext';
import type { JobStatus, JobType } from '@/types/database';

// --------------- Inline editable job status badge ---------------
function EditableJobStatus({ value, jobId, onSave }: { value: JobStatus; jobId: string; onSave: (id: string, u: { status: JobStatus }) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = async (v: string) => {
    if (v !== value) await onSave(jobId, { status: v as JobStatus });
    setEditing(false);
  };

  if (editing) {
    return (
      <select
        ref={ref}
        value={value}
        onChange={e => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        onClick={e => e.preventDefault()}
        className="px-2 py-1 border border-sky-400 rounded-lg text-xs outline-none bg-white focus:ring-2 focus:ring-sky-200 relative z-10"
      >
        {JOB_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }

  return (
    <span
      onClick={e => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
      className="text-xs font-bold uppercase tracking-wider opacity-80 cursor-pointer hover:opacity-100 inline-flex items-center gap-1 group"
      title="Click to change status"
    >
      {value}
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </span>
  );
}

export default function Service() {
  const { unscheduledJobs, scheduledJobs, isLoading, createJob, updateJob } = useServiceJobs();
  const { contacts } = useContacts();
  const { locations } = useAuth();
  const todayDisplay = format(new Date(), 'MMMM d, yyyy');
  const [showCreate, setShowCreate] = useState(false);
  const [newJob, setNewJob] = useState({
    title: '', contact_id: '', location_id: '',
    job_type: 'Repair' as JobType,
    status: 'In Progress' as JobStatus,
    description: '', scheduled_at: '',
    priority: 'Medium' as 'High' | 'Medium' | 'Low',
    amount_to_collect: '',
  });

  const handleCreate = async () => {
    await createJob({
      title: newJob.title,
      contact_id: newJob.contact_id,
      location_id: newJob.location_id || (locations[0]?.id ?? ''),
      job_type: newJob.job_type,
      status: newJob.status,
      description: newJob.description || null,
      scheduled_at: newJob.scheduled_at || null,
      priority: newJob.priority,
      amount_to_collect: newJob.amount_to_collect ? parseFloat(newJob.amount_to_collect) : null,
    });
    setShowCreate(false);
    setNewJob({ title: '', contact_id: '', location_id: '', job_type: 'Repair', status: 'In Progress', description: '', scheduled_at: '', priority: 'Medium', amount_to_collect: '' });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Service & Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">Schedule and dispatch technicians &mdash; click any status to change it</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Filter className="w-4 h-4 mr-2" />Filter</button>
          <button onClick={() => setShowCreate(true)} className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Plus className="w-4 h-4 mr-2" />New Job</button>
        </div>
      </div>
      {/* Create Job Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">New Job</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Job Title *" value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <select value={newJob.contact_id} onChange={e => setNewJob({...newJob, contact_id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                <option value="">Select Customer *</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} \u2014 {c.phone}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select value={newJob.job_type} onChange={e => setNewJob({...newJob, job_type: e.target.value as JobType})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>Delivery</option><option>Repair</option><option>Installation</option><option>Warranty</option><option>Maintenance</option><option>Pickup</option>
                </select>
                <select value={newJob.status} onChange={e => setNewJob({...newJob, status: e.target.value as JobStatus})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>In Progress</option><option>Delivery</option><option>Parts on Order</option><option>Warranty</option><option>Ready for Pickup</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={newJob.location_id} onChange={e => setNewJob({...newJob, location_id: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="">Location *</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={newJob.priority} onChange={e => setNewJob({...newJob, priority: e.target.value as 'High' | 'Medium' | 'Low'})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
              </div>
              <input type="datetime-local" value={newJob.scheduled_at} onChange={e => setNewJob({...newJob, scheduled_at: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <input placeholder="Amount to Collect ($)" type="number" value={newJob.amount_to_collect} onChange={e => setNewJob({...newJob, amount_to_collect: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <textarea placeholder="Description / Notes" value={newJob.description} onChange={e => setNewJob({...newJob, description: e.target.value})} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400 resize-none" />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newJob.title || !newJob.contact_id || !newJob.location_id} className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:opacity-50">Create Job</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden gap-6">
        {/* Unscheduled Queue */}
        <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Unscheduled Queue</h2>
            <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">{unscheduledJobs.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {unscheduledJobs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No unscheduled jobs</p>
            ) : unscheduledJobs.map(job => (
              <div key={job.id} className={cn("block p-3 rounded-r-lg border border-l-4 shadow-sm hover:shadow-md transition-all", statusColors[job.status as JobStatus] ?? 'bg-slate-50')}>
                <EditableJobStatus value={job.status as JobStatus} jobId={job.id} onSave={updateJob} />
                <Link to={`/service/${job.id}`} className="block">
                  <h3 className="font-medium text-sm mb-2 leading-tight hover:text-sky-700">{job.title}</h3>
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Schedule Board */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="flex items-center space-x-4">
              <h2 className="font-semibold text-slate-800 flex items-center"><CalendarIcon className="w-5 h-5 mr-2 text-slate-500" />Today's Schedule</h2>
              <div className="text-sm text-slate-500">{todayDisplay}</div>
            </div>
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button className="px-3 py-1 text-sm font-medium bg-white shadow-sm rounded-md text-slate-800">Day</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Week</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Month</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            <div className="space-y-4">
              {scheduledJobs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No jobs scheduled today</p>
              ) : scheduledJobs.map(job => (
                <div key={job.id} className={cn("block p-4 rounded-r-lg border border-l-4 shadow-sm bg-white hover:shadow-md transition-all", statusColors[job.status as JobStatus] ?? 'bg-slate-50')}>
                  <EditableJobStatus value={job.status as JobStatus} jobId={job.id} onSave={updateJob} />
                  <Link to={`/service/${job.id}`} className="block">
                    <h3 className="font-medium text-slate-900 hover:text-sky-700">{job.title}</h3>
                    <div className="flex items-center space-x-4 mt-2 text-sm opacity-80">
                      {job.scheduled_at && <span className="flex items-center"><Clock className="w-4 h-4 mr-1" />{new Date(job.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
import { Calendar as CalendarIcon, Clock, MapPin, User, Plus, Filter, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useServiceJobs, statusColors } from '@/hooks/useServiceJobs';
import { useContacts } from '@/hooks/useContacts';
import { useAuth } from '@/contexts/AuthContext';
import type { JobStatus, JobType } from '@/types/database';

export default function Service() {
  const { unscheduledJobs, scheduledJobs, isLoading, createJob } = useServiceJobs();
  const { contacts } = useContacts();
  const { locations } = useAuth();
  const todayDisplay = format(new Date(), 'MMMM d, yyyy');
  const [showCreate, setShowCreate] = useState(false);
  const [newJob, setNewJob] = useState({
    title: '', contact_id: '', location_id: '',
    job_type: 'Repair' as JobType,
    status: 'In Progress' as JobStatus,
    description: '', scheduled_at: '',
    priority: 'Medium' as 'High' | 'Medium' | 'Low',
    amount_to_collect: '',
  });

  const handleCreate = async () => {
    await createJob({
      title: newJob.title,
      contact_id: newJob.contact_id,
      location_id: newJob.location_id || (locations[0]?.id ?? ''),
      job_type: newJob.job_type,
      status: newJob.status,
      description: newJob.description || null,
      scheduled_at: newJob.scheduled_at || null,
      priority: newJob.priority,
      amount_to_collect: newJob.amount_to_collect ? parseFloat(newJob.amount_to_collect) : null,
    });
    setShowCreate(false);
    setNewJob({ title: '', contact_id: '', location_id: '', job_type: 'Repair', status: 'In Progress', description: '', scheduled_at: '', priority: 'Medium', amount_to_collect: '' });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Service & Jobs</h1>
          <p className="text-sm text-slate-500 mt-1">Schedule and dispatch technicians</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Filter className="w-4 h-4 mr-2" />Filter</button>
          <button onClick={() => setShowCreate(true)} className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Plus className="w-4 h-4 mr-2" />New Job</button>
        </div>
      </div>
      {/* Create Job Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">New Job</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Job Title *" value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <select value={newJob.contact_id} onChange={e => setNewJob({...newJob, contact_id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                <option value="">Select Customer *</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} \u2014 {c.phone}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select value={newJob.job_type} onChange={e => setNewJob({...newJob, job_type: e.target.value as JobType})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>Delivery</option><option>Repair</option><option>Installation</option><option>Warranty</option><option>Maintenance</option><option>Pickup</option>
                </select>
                <select value={newJob.status} onChange={e => setNewJob({...newJob, status: e.target.value as JobStatus})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>In Progress</option><option>Delivery</option><option>Parts on Order</option><option>Warranty</option><option>Ready for Pickup</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={newJob.location_id} onChange={e => setNewJob({...newJob, location_id: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="">Location *</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={newJob.priority} onChange={e => setNewJob({...newJob, priority: e.target.value as 'High' | 'Medium' | 'Low'})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
              </div>
              <input type="datetime-local" value={newJob.scheduled_at} onChange={e => setNewJob({...newJob, scheduled_at: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <input placeholder="Amount to Collect ($)" type="number" value={newJob.amount_to_collect} onChange={e => setNewJob({...newJob, amount_to_collect: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <textarea placeholder="Description / Notes" value={newJob.description} onChange={e => setNewJob({...newJob, description: e.target.value})} rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400 resize-none" />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newJob.title || !newJob.contact_id || !newJob.location_id} className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:opacity-50">Create Job</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden gap-6">
        {/* Unscheduled Queue */}
        <div className="w-80 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden shrink-0">
          <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
            <h2 className="font-semibold text-slate-800">Unscheduled Queue</h2>
            <span className="bg-slate-200 text-slate-700 text-xs font-bold px-2 py-1 rounded-full">{unscheduledJobs.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {unscheduledJobs.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">No unscheduled jobs</p>
            ) : unscheduledJobs.map(job => (
              <Link key={job.id} to={`/service/${job.id}`} className={cn("block p-3 rounded-r-lg border border-l-4 shadow-sm hover:shadow-md transition-all", statusColors[job.status as JobStatus] ?? 'bg-slate-50')}>
                <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{job.status}</div>
                <h3 className="font-medium text-sm mb-2 leading-tight">{job.title}</h3>
              </Link>
            ))}
          </div>
        </div>

        {/* Schedule Board */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
            <div className="flex items-center space-x-4">
              <h2 className="font-semibold text-slate-800 flex items-center"><CalendarIcon className="w-5 h-5 mr-2 text-slate-500" />Today's Schedule</h2>
              <div className="text-sm text-slate-500">{todayDisplay}</div>
            </div>
            <div className="flex bg-slate-200 p-1 rounded-lg">
              <button className="px-3 py-1 text-sm font-medium bg-white shadow-sm rounded-md text-slate-800">Day</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Week</button>
              <button className="px-3 py-1 text-sm font-medium text-slate-600 hover:text-slate-800">Month</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50">
            <div className="space-y-4">
              {scheduledJobs.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No jobs scheduled today</p>
              ) : scheduledJobs.map(job => (
                <Link key={job.id} to={`/service/${job.id}`} className={cn("block p-4 rounded-r-lg border border-l-4 shadow-sm bg-white hover:shadow-md transition-all", statusColors[job.status as JobStatus] ?? 'bg-slate-50')}>
                  <div className="text-xs font-bold uppercase tracking-wider mb-1 opacity-80">{job.status}</div>
                  <h3 className="font-medium text-slate-900">{job.title}</h3>
                  <div className="flex items-center space-x-4 mt-2 text-sm opacity-80">
                    {job.scheduled_at && <span className="flex items-center"><Clock className="w-4 h-4 mr-1" />{new Date(job.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
