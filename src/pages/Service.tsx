import { Calendar as CalendarIcon, Clock, Plus, X, Pencil, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useRef, useEffect, useMemo } from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, isSameDay, isWithinInterval, eachDayOfInterval } from 'date-fns';
import { cn } from '@/lib/utils';
import { useServiceJobs, statusColors, statusChipColors, statusDotColors, JOB_STATUS_OPTIONS } from '@/hooks/useServiceJobs';
import { useContacts } from '@/hooks/useContacts';
import { useAuth } from '@/contexts/AuthContext';
import type { Job, JobStatus, JobType } from '@/types/database';
import { useToast } from '@/components/ui/Toast';

type ViewMode = 'day' | 'week' | 'month';
type ServiceJob = Job & { contacts?: { first_name: string; last_name: string } | null };

// Statuses shown in the legend/filter (Cancelled is hidden from boards anyway)
const LEGEND_STATUSES: JobStatus[] = ['Delivery', 'Warranty', 'Parts on Order', 'In Progress', 'Ready for Pickup', 'Completed'];

const jobTime = (j: ServiceJob) => j.scheduled_at ? format(new Date(j.scheduled_at), 'h:mm') : '';

// --------------- Inline editable job status ---------------
function EditableJobStatus({ value, jobId, onSave, light }: { value: JobStatus; jobId: string; onSave: (id: string, u: { status: JobStatus }) => Promise<boolean>; light?: boolean }) {
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
        ref={ref} value={value}
        onChange={e => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        onClick={e => e.stopPropagation()}
        className="px-2 py-1 border border-brand-500 rounded-lg text-xs outline-none bg-ink-900 text-ink-100 focus:ring-2 focus:ring-brand-500/30 relative z-10"
      >
        {JOB_STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }
  return (
    <span
      onClick={e => { e.preventDefault(); e.stopPropagation(); setEditing(true); }}
      className={cn('text-[10px] font-bold uppercase tracking-wider cursor-pointer inline-flex items-center gap-1 group', light ? 'opacity-90 hover:opacity-100' : 'opacity-70 hover:opacity-100')}
      title="Click to change status"
    >
      {value}
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-70 transition-opacity" />
    </span>
  );
}

// --------------- Day/week job card ---------------
function JobCard({ job, saveJobStatus }: { job: ServiceJob; saveJobStatus: (id: string, u: { status: JobStatus }) => Promise<boolean> }) {
  const contact = job.contacts;
  return (
    <div className={cn('block p-3.5 rounded-r-lg border border-ink-800 border-l-4 transition-all hover:brightness-110', statusColors[job.status as JobStatus] ?? 'bg-ink-950')}>
      <div className="flex items-center justify-between gap-2">
        <EditableJobStatus value={job.status as JobStatus} jobId={job.id} onSave={saveJobStatus} />
        {job.scheduled_at && (
          <span className="flex items-center text-xs opacity-80 shrink-0"><Clock className="w-3 h-3 mr-1" />{format(new Date(job.scheduled_at), 'h:mm a')}</span>
        )}
      </div>
      <Link to={`/service/${job.id}`} className="block mt-1">
        <h3 className="font-semibold text-sm leading-snug hover:underline underline-offset-2">{job.title}</h3>
        <p className="text-xs opacity-70 mt-0.5">
          {job.job_type}{contact ? ` · ${contact.first_name} ${contact.last_name}` : ''}
        </p>
      </Link>
    </div>
  );
}

export default function Service() {
  const { jobs, unscheduledJobs, scheduledJobs, isLoading, createJob, updateJob } = useServiceJobs();
  const { contacts } = useContacts();
  const { locations, profile, activeLocationId } = useAuth();
  const { toast } = useToast();

  const location = useLocation();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [statusFilter, setStatusFilter] = useState<Set<JobStatus>>(new Set());

  const saveJobStatus = async (id: string, u: { status: JobStatus }) => {
    const ok = await updateJob(id, u);
    toast(ok ? `Status → ${u.status}` : 'Failed to update', ok ? 'success' : 'error');
    return ok;
  };

  const toggleFilter = (s: JobStatus) =>
    setStatusFilter(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });

  // ─── Drag-to-schedule: queue → day, day → day, chip → queue ───
  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination || destination.droppableId === source.droppableId) return;
    const jobId = draggableId.replace(/^(un|sch)-/, '');

    if (destination.droppableId === 'queue') {
      if (!draggableId.startsWith('sch-')) return;
      const ok = await updateJob(jobId, { scheduled_at: null });
      toast(ok ? 'Moved to Unscheduled Queue' : 'Failed to move', ok ? 'success' : 'error');
      return;
    }
    if (destination.droppableId.startsWith('day-')) {
      const dateStr = destination.droppableId.slice(4); // yyyy-MM-dd
      const job = jobs.find(j => j.id === jobId);
      const time = job?.scheduled_at ? format(new Date(job.scheduled_at), 'HH:mm:ss') : '09:00:00';
      const ok = await updateJob(jobId, { scheduled_at: `${dateStr}T${time}` });
      toast(ok ? `Scheduled for ${format(new Date(`${dateStr}T12:00:00`), 'EEE, MMM d')}` : 'Failed to schedule', ok ? 'success' : 'error');
    }
  };

  // ─── Navigation ────────────────────────────────────────
  const goBack = () => {
    if (viewMode === 'day') setCurrentDate(d => subDays(d, 1));
    else if (viewMode === 'week') setCurrentDate(d => subWeeks(d, 1));
    else setCurrentDate(d => subMonths(d, 1));
  };
  const goForward = () => {
    if (viewMode === 'day') setCurrentDate(d => addDays(d, 1));
    else if (viewMode === 'week') setCurrentDate(d => addWeeks(d, 1));
    else setCurrentDate(d => addMonths(d, 1));
  };
  const goToday = () => setCurrentDate(new Date());

  // ─── Date range for current view ───────────────────────
  const { rangeStart, rangeEnd, dateLabel } = useMemo(() => {
    if (viewMode === 'day') {
      const d = currentDate;
      return {
        rangeStart: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0),
        rangeEnd: new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59),
        dateLabel: format(d, 'MMMM d, yyyy'),
      };
    } else if (viewMode === 'week') {
      const ws = startOfWeek(currentDate, { weekStartsOn: 0 });
      const we = endOfWeek(currentDate, { weekStartsOn: 0 });
      return { rangeStart: ws, rangeEnd: we, dateLabel: `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}` };
    }
    return { rangeStart: startOfMonth(currentDate), rangeEnd: endOfMonth(currentDate), dateLabel: format(currentDate, 'MMMM yyyy') };
  }, [viewMode, currentDate]);

  // ─── Jobs in range, honoring the legend filter ─────────
  const filteredJobs = useMemo(() => {
    return (scheduledJobs as ServiceJob[]).filter(j => {
      if (!j.scheduled_at) return false;
      if (statusFilter.size > 0 && !statusFilter.has(j.status as JobStatus)) return false;
      return isWithinInterval(new Date(j.scheduled_at), { start: rangeStart, end: rangeEnd });
    });
  }, [scheduledJobs, rangeStart, rangeEnd, statusFilter]);

  const legendCounts = useMemo(() => {
    const c = {} as Record<JobStatus, number>;
    for (const j of jobs) c[j.status as JobStatus] = (c[j.status as JobStatus] ?? 0) + 1;
    return c;
  }, [jobs]);

  // ─── Create job modal ──────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);

  // Arriving via the dashboard's "+ New" → open the modal immediately, smart defaults applied.
  // A customer card dropped on the Schedule pill arrives with contactId pre-picked.
  const pendingContactRef = useRef<string | null>(null);
  useEffect(() => {
    const st = location.state as { openNew?: boolean; contactId?: string } | null;
    if (st?.openNew) {
      setNewJob(j => ({
        ...j,
        contact_id: st.contactId ?? j.contact_id,
        location_id: j.location_id || activeLocationId || profile?.location_id || locations[0]?.id || '',
      }));
      if (st.contactId) pendingContactRef.current = st.contactId;
      setShowCreate(true);
      navigate(location.pathname, { replace: true, state: null }); // consume the flag
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);
  const autoTitleRef = useRef('');
  const applyAutoTitle = (contactId: string, jobType: string) => {
    const c = contacts.find(x => x.id === contactId);
    if (!c) return;
    const auto = `${c.last_name} – ${jobType}`;
    setNewJob(j => {
      if (j.title !== '' && j.title !== autoTitleRef.current) return j; // hand-edited: leave it alone
      autoTitleRef.current = auto;
      return { ...j, title: auto };
    });
  };
  // Prefilled customer: fire the auto-title once the contact list arrives
  useEffect(() => {
    const cid = pendingContactRef.current;
    if (cid && contacts.some(c => c.id === cid)) {
      pendingContactRef.current = null;
      applyAutoTitle(cid, newJob.job_type);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts]);
  const [newJob, setNewJob] = useState({
    title: '', contact_id: '', location_id: '',
    job_type: 'Repair' as JobType, status: 'In Progress' as JobStatus,
    description: '', scheduled_at: '', priority: 'Medium' as 'High' | 'Medium' | 'Low', amount_to_collect: '',
  });
  const handleCreate = async () => {
    await createJob({
      title: newJob.title, contact_id: newJob.contact_id,
      location_id: newJob.location_id || (locations[0]?.id ?? ''),
      job_type: newJob.job_type, status: newJob.status,
      description: newJob.description || null, scheduled_at: newJob.scheduled_at || null,
      priority: newJob.priority,
      amount_to_collect: newJob.amount_to_collect ? parseFloat(newJob.amount_to_collect) : null,
    });
    setShowCreate(false);
    setNewJob({ title: '', contact_id: '', location_id: '', job_type: 'Repair', status: 'In Progress', description: '', scheduled_at: '', priority: 'Medium', amount_to_collect: '' });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink-100 tracking-tight">Service Schedule</h1>
          <p className="hidden sm:block text-sm text-ink-400 mt-1">Drag jobs from the queue onto a day — drag back to unschedule</p>
        </div>
        <button
          onClick={() => {
            // Smart default: pre-pick the store you're already working in
            setNewJob(j => ({ ...j, location_id: j.location_id || activeLocationId || profile?.location_id || locations[0]?.id || '' }));
            setShowCreate(true);
          }}
          className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />New Job
        </button>
      </div>

      {/* Color legend = working filter (Brandon's color language) */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4 shrink-0">
        {LEGEND_STATUSES.map(s => {
          const active = statusFilter.has(s);
          return (
            <button
              key={s}
              onClick={() => toggleFilter(s)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-semibold border transition-all',
                active
                  ? 'bg-brand-500/15 border-brand-500/50 text-brand-300'
                  : 'bg-ink-900 border-ink-700 text-ink-400 hover:text-ink-200 hover:border-ink-600'
              )}
            >
              <span className={cn('w-2 h-2 rounded-full shrink-0', statusDotColors[s])} />
              {s}
              <span className="font-mono text-[10px] opacity-70">{legendCounts[s] ?? 0}</span>
            </button>
          );
        })}
        {statusFilter.size > 0 && (
          <button onClick={() => setStatusFilter(new Set())} className="text-[11px] font-semibold text-brand-400 hover:text-brand-300 px-2">
            Clear filter
          </button>
        )}
      </div>

      {/* Create Job Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-ink-900 rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-ink-100">New Job</h2>
              <button onClick={() => setShowCreate(false)} className="text-ink-500 hover:text-ink-300"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Job Title *" value={newJob.title} onChange={e => setNewJob({...newJob, title: e.target.value})} className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" />
              <select value={newJob.contact_id} onChange={e => { setNewJob({...newJob, contact_id: e.target.value}); applyAutoTitle(e.target.value, newJob.job_type); }} className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500">
                <option value="">Select Customer *</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.phone}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <select value={newJob.job_type} onChange={e => { setNewJob({...newJob, job_type: e.target.value as JobType}); applyAutoTitle(newJob.contact_id, e.target.value); }} className="px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500">
                  <option>Delivery</option><option>Repair</option><option>Installation</option><option>Warranty</option><option>Maintenance</option><option>Pickup</option>
                </select>
                <select value={newJob.status} onChange={e => setNewJob({...newJob, status: e.target.value as JobStatus})} className="px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500">
                  <option>In Progress</option><option>Delivery</option><option>Parts on Order</option><option>Warranty</option><option>Ready for Pickup</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={newJob.location_id} onChange={e => setNewJob({...newJob, location_id: e.target.value})} className="px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500">
                  <option value="">Location *</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
                <select value={newJob.priority} onChange={e => setNewJob({...newJob, priority: e.target.value as 'High' | 'Medium' | 'Low'})} className="px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500">
                  <option value="High">High Priority</option><option value="Medium">Medium Priority</option><option value="Low">Low Priority</option>
                </select>
              </div>
              <input type="datetime-local" value={newJob.scheduled_at} onChange={e => setNewJob({...newJob, scheduled_at: e.target.value})} className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" />
              <input placeholder="Amount to Collect ($)" type="number" value={newJob.amount_to_collect} onChange={e => setNewJob({...newJob, amount_to_collect: e.target.value})} className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500" />
              <textarea placeholder="Description / Notes" value={newJob.description} onChange={e => setNewJob({...newJob, description: e.target.value})} rows={3} className="w-full px-3 py-2 border border-ink-700 rounded-lg text-sm outline-none focus:border-brand-500 resize-none" />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-ink-300 hover:bg-ink-800 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newJob.title || !newJob.contact_id || !newJob.location_id} className="px-4 py-2 text-sm bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium disabled:opacity-50">Create Job</button>
            </div>
          </div>
        </div>
      )}

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-col lg:flex-row flex-1 overflow-hidden gap-4">
          {/* ─── Schedule board (left, like Jobber's calendar) ─── */}
          <div className="flex-1 flex flex-col bg-ink-900 rounded-xl border border-ink-700 shadow-sm overflow-hidden min-h-[420px]">
            <div className="p-3 sm:p-4 border-b border-ink-700 flex flex-wrap justify-between items-center gap-2 bg-ink-950">
              <div className="flex items-center gap-2">
                <button onClick={goBack} className="p-1.5 hover:bg-ink-700 rounded-lg transition-colors" aria-label="Previous"><ChevronLeft className="w-4 h-4 text-ink-300" /></button>
                <button onClick={goToday} className="px-2.5 py-1 text-xs font-semibold text-brand-400 border border-brand-500/30 hover:bg-brand-500/10 rounded-lg transition-colors">Today</button>
                <button onClick={goForward} className="p-1.5 hover:bg-ink-700 rounded-lg transition-colors" aria-label="Next"><ChevronRight className="w-4 h-4 text-ink-300" /></button>
                <span className="text-sm font-semibold text-ink-100 ml-1">{dateLabel}</span>
              </div>
              <div className="flex bg-ink-800 p-1 rounded-lg">
                {(['day', 'week', 'month'] as ViewMode[]).map(mode => (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    className={cn('px-3 py-1 text-[13px] font-semibold rounded-md transition-all capitalize', viewMode === mode ? 'bg-brand-500/20 text-brand-300' : 'text-ink-400 hover:text-ink-200')}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto bg-ink-950/50">
              {/* ─── DAY ─── */}
              {viewMode === 'day' && (
                <Droppable droppableId={`day-${format(currentDate, 'yyyy-MM-dd')}`}>
                  {(provided, snapshot) => (
                    <div ref={provided.innerRef} {...provided.droppableProps} className={cn('p-4 sm:p-6 space-y-3 min-h-full transition-colors', snapshot.isDraggingOver && 'bg-brand-500/10')}>
                      {filteredJobs.length === 0 ? (
                        <div className="text-center py-16">
                          <CalendarIcon className="w-10 h-10 text-ink-600 mx-auto mb-3" />
                          <p className="text-sm text-ink-500">No jobs scheduled for {format(currentDate, 'MMMM d')}</p>
                          <p className="text-xs text-ink-600 mt-1">Drag one over from the queue</p>
                        </div>
                      ) : filteredJobs.map((job, i) => (
                        <Draggable key={job.id} draggableId={`sch-${job.id}`} index={i}>
                          {(p) => (
                            <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                              <JobCard job={job} saveJobStatus={saveJobStatus} />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              )}

              {/* ─── WEEK ─── */}
              {viewMode === 'week' && (
                <div className="divide-y divide-ink-800">
                  {eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(date => {
                    const isToday = isSameDay(date, new Date());
                    const dayJobs = filteredJobs.filter(j => j.scheduled_at && isSameDay(new Date(j.scheduled_at), date));
                    return (
                      <Droppable key={date.toISOString()} droppableId={`day-${format(date, 'yyyy-MM-dd')}`}>
                        {(provided, snapshot) => (
                          <div ref={provided.innerRef} {...provided.droppableProps} className={cn('p-3 sm:p-4 transition-colors', isToday && 'bg-brand-500/5', snapshot.isDraggingOver && 'bg-brand-500/10')}>
                            <div className="flex items-center gap-3 mb-2">
                              <div className={cn('w-10 h-10 rounded-lg flex flex-col items-center justify-center shrink-0', isToday ? 'bg-brand-500 text-white' : 'bg-ink-950 text-ink-300')}>
                                <span className="text-[10px] font-semibold uppercase leading-none">{format(date, 'EEE')}</span>
                                <span className="text-sm font-bold leading-tight">{format(date, 'd')}</span>
                              </div>
                              <p className="text-xs text-ink-500 font-medium">{dayJobs.length > 0 ? `${dayJobs.length} visit${dayJobs.length !== 1 ? 's' : ''}` : '—'}</p>
                            </div>
                            <div className="ml-[52px] space-y-2">
                              {dayJobs.map((job, i) => (
                                <Draggable key={job.id} draggableId={`sch-${job.id}`} index={i}>
                                  {(p) => (
                                    <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                                      <JobCard job={job} saveJobStatus={saveJobStatus} />
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                          </div>
                        )}
                      </Droppable>
                    );
                  })}
                </div>
              )}

              {/* ─── MONTH (the Jobber board) ─── */}
              {viewMode === 'month' && (
                <div>
                  <div className="grid grid-cols-7 border-b border-ink-700 bg-ink-950 sticky top-0 z-10">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                      <div key={d} className="py-2 text-center text-[11px] font-semibold text-ink-400 uppercase">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {eachDayOfInterval({
                      start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 }),
                      end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 }),
                    }).map(day => {
                      const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                      const isToday = isSameDay(day, new Date());
                      const dayJobs = filteredJobs.filter(j => j.scheduled_at && isSameDay(new Date(j.scheduled_at), day));
                      return (
                        <Droppable key={day.toISOString()} droppableId={`day-${format(day, 'yyyy-MM-dd')}`}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              onClick={() => { setCurrentDate(day); setViewMode('day'); }}
                              className={cn(
                                'min-h-[104px] border-b border-r border-ink-800 p-1.5 cursor-pointer transition-colors',
                                !isCurrentMonth && 'bg-ink-950/60 opacity-50',
                                snapshot.isDraggingOver ? 'bg-brand-500/15 ring-1 ring-inset ring-brand-500/50' : 'hover:bg-ink-800/40'
                              )}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <span className={cn('text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full', isToday ? 'bg-brand-500 text-white' : 'text-ink-300')}>
                                  {format(day, 'd')}
                                </span>
                                {dayJobs.length > 0 && (
                                  <span className="text-[9px] font-bold text-ink-500 uppercase tracking-wide">{dayJobs.length} visit{dayJobs.length !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                              <div className="space-y-[3px]">
                                {dayJobs.slice(0, 3).map((job, i) => (
                                  <Draggable key={job.id} draggableId={`sch-${job.id}`} index={i}>
                                    {(p, snap) => (
                                      <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}>
                                        <Link
                                          to={`/service/${job.id}`}
                                          onClick={e => e.stopPropagation()}
                                          title={`${job.title}${job.scheduled_at ? ` — ${format(new Date(job.scheduled_at), 'h:mm a')}` : ''}`}
                                          className={cn(
                                            'block text-[10px] leading-[15px] px-1.5 py-[3px] rounded-[4px] truncate font-semibold shadow-sm',
                                            statusChipColors[job.status as JobStatus] ?? 'bg-ink-800 text-ink-300',
                                            snap.isDragging && 'ring-2 ring-brand-400'
                                          )}
                                        >
                                          {jobTime(job) && <span className="font-bold mr-1">{jobTime(job)}</span>}
                                          {job.title}
                                        </Link>
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                                {dayJobs.length > 3 && (
                                  <div className="text-[9px] text-ink-500 font-semibold px-1">+{dayJobs.length - 3} more</div>
                                )}
                              </div>
                            </div>
                          )}
                        </Droppable>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─── Unscheduled queue (right, like Jobber) ─── */}
          <div className="w-full lg:w-72 flex flex-col bg-ink-900 rounded-xl border border-ink-700 shadow-sm overflow-hidden shrink-0 max-h-72 lg:max-h-none">
            <div className="p-3.5 border-b border-ink-700 bg-ink-950 flex justify-between items-center shrink-0">
              <h2 className="text-sm font-semibold text-ink-100">Unscheduled</h2>
              <span className="bg-ink-700 text-ink-300 text-xs font-bold px-2 py-0.5 rounded-full">{unscheduledJobs.length}</span>
            </div>
            <Droppable droppableId="queue">
              {(provided, snapshot) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className={cn('flex-1 overflow-y-auto p-2.5 space-y-1.5 transition-colors', snapshot.isDraggingOver && 'bg-brand-500/10')}>
                  {unscheduledJobs.length === 0 ? (
                    <p className="text-xs text-ink-500 text-center py-8">Queue is clear</p>
                  ) : (unscheduledJobs as ServiceJob[]).map((job, i) => (
                    <Draggable key={job.id} draggableId={`un-${job.id}`} index={i}>
                      {(p, snap) => (
                        <div
                          ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                          className={cn(
                            'rounded-md px-2.5 py-2 shadow-sm cursor-grab active:cursor-grabbing',
                            statusChipColors[job.status as JobStatus] ?? 'bg-ink-800 text-ink-300',
                            snap.isDragging && 'ring-2 ring-brand-400 rotate-1'
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <EditableJobStatus value={job.status as JobStatus} jobId={job.id} onSave={saveJobStatus} light />
                          </div>
                          <Link to={`/service/${job.id}`} onClick={e => e.stopPropagation()} className="block text-xs font-semibold leading-snug mt-0.5 hover:underline underline-offset-2">
                            {job.title}
                          </Link>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </div>
        </div>
      </DragDropContext>
    </div>
  );
}
