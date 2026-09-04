import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, BellRing, Camera, CheckCircle2, ClipboardCheck, Pencil, Save, Send, Trash2, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { signedProofUrl, useDelegatedTasks, type DelegatedPerson, type DelegatedTask } from '@/hooks/useDelegatedTasks';
import {
  DELEGATED_NOTES_MAX,
  DELEGATED_STATUS_LABELS,
  canAnnotateDelegatedTask,
  canCompleteDelegatedTask,
  canEditDelegatedTask,
  defaultDelegatedView,
  delegatedTaskDueAt,
  filterDelegatedTasks,
  formatDelegatedDue,
  groupDelegatedTasksByAssignee,
  prioritizeOwnAssigneeGroups,
  isDelegatedTaskOverdue,
  splitDelegatedSections,
  toDelegatedDueInput,
  type DelegatedTaskStatusFilter,
  type DelegatedTaskView,
} from '@/lib/delegatedTasks';
import { cn } from '@/lib/utils';

const personName = (person: DelegatedPerson | null | undefined, fallback = 'Teammate') =>
  person ? `${person.first_name} ${person.last_name}`.trim() || fallback : fallback;

const fieldClass = 'rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-normal text-ink-100 outline-none placeholder:text-ink-600 focus:ring-2 focus:ring-brand-500';
const chipClass = 'rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-xs font-medium text-ink-200 outline-none focus:ring-2 focus:ring-brand-500';

export default function DelegatedTasksPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const location = useLocation();
  const { tasks, staff, isLoading, error, createTask, updateTask, deleteTask, uploadProof, nudgeTask, refresh } = useDelegatedTasks();
  const isOwner = profile?.role === 'owner_manager';
  const viewer = profile ? { id: profile.id, role: profile.role } : null;

  const [view, setView] = useState<DelegatedTaskView>(() => defaultDelegatedView(profile?.role));
  const [staffFilter, setStaffFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<DelegatedTaskStatusFilter>('all');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [request, setRequest] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ assigned_to: '', due_at: '', request: '' });
  const [deleteTarget, setDeleteTarget] = useState<DelegatedTask | null>(null);
  const [proofRequired, setProofRequired] = useState(false);
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const proofInputRef = useRef<HTMLInputElement>(null);
  const [proofTarget, setProofTarget] = useState<DelegatedTask | null>(null);

  useEffect(() => { setView(defaultDelegatedView(profile?.role)); }, [profile?.role]);

  // Notifications deep-link here: /dashboard?delegated=open&staff=<id>
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('delegated') !== 'open') return;
    const staffId = params.get('staff');
    if (staffId && isOwner) { setStaffFilter(staffId); setView('everyone'); }
    setStatusFilter('all');
    document.getElementById('delegated-tasks-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.search, isOwner]);

  useEffect(() => {
    setNotes(current => {
      const next = { ...current };
      tasks.forEach(task => {
        if (!(task.id in next)) next[task.id] = task.assignee_notes ?? '';
      });
      return next;
    });
  }, [tasks]);

  // Completed photo proofs are private; resolve one signed URL per task on demand.
  useEffect(() => {
    const missing = tasks.filter(task => task.proof_photo_path && !proofUrls[task.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    void Promise.all(missing.map(async task => [task.id, await signedProofUrl(task.proof_photo_path!)] as const)).then(pairs => {
      if (cancelled) return;
      setProofUrls(current => ({ ...current, ...Object.fromEntries(pairs.filter(([, url]) => url) as [string, string][]) }));
    });
    return () => { cancelled = true; };
  }, [tasks, proofUrls]);

  const visibleTasks = useMemo(() => {
    if (!profile) return [];
    return filterDelegatedTasks(tasks, { view, userId: profile.id, assignedTo: staffFilter || undefined, status: statusFilter });
  }, [tasks, view, profile, staffFilter, statusFilter]);
  const sections = useMemo(() => splitDelegatedSections(visibleTasks), [visibleTasks]);
  const groupedSections = useMemo(() => ({
    incomplete: prioritizeOwnAssigneeGroups(groupDelegatedTasksByAssignee(sections.incomplete), profile?.id),
    completed: prioritizeOwnAssigneeGroups(groupDelegatedTasksByAssignee(sections.completed), profile?.id),
  }), [sections, profile?.id]);
  const myOpenCount = useMemo(
    () => profile ? tasks.filter(task => task.assigned_to === profile.id && task.status !== 'Completed').length : 0,
    [tasks, profile],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!assignedTo || !request.trim()) {
      toast('Choose who this is for and describe what needs to be done.', 'warning');
      return;
    }
    if (dueAt && !delegatedTaskDueAt(dueAt)) {
      toast('Enter a valid due date and time, or leave it blank.', 'warning');
      return;
    }
    setSubmitting(true);
    const result = await createTask({ assigned_to: assignedTo, due_at: delegatedTaskDueAt(dueAt), request, proof_required: proofRequired });
    setSubmitting(false);
    toast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) { setRequest(''); setDueAt(''); setProofRequired(false); }
  };

  const toggleComplete = async (task: DelegatedTask, completed: boolean) => {
    // A task that demands a photo opens the camera first; completion follows the upload.
    if (completed && task.proof_required && !task.proof_photo_path) {
      setProofTarget(task);
      proofInputRef.current?.click();
      return;
    }
    setSavingId(task.id);
    const result = await updateTask(task.id, { status: completed ? 'Completed' : 'Pending' });
    setSavingId(null);
    toast(result.message, result.ok ? 'success' : 'error');
  };

  const completeWithPhoto = async (file: File | undefined) => {
    const task = proofTarget;
    setProofTarget(null);
    if (!task || !file) return;
    setSavingId(task.id);
    const upload = await uploadProof(task.id, file);
    if (!('path' in upload)) { setSavingId(null); toast(upload.message, 'error'); return; }
    const result = await updateTask(task.id, { status: 'Completed', proof_photo_path: upload.path });
    setSavingId(null);
    toast(result.ok ? 'Photo saved and task completed.' : result.message, result.ok ? 'success' : 'error');
  };

  const nudge = async (task: DelegatedTask) => {
    setSavingId(task.id);
    const result = await nudgeTask(task);
    setSavingId(null);
    toast(result.message, result.ok ? 'success' : 'warning');
  };

  const saveNotes = async (task: DelegatedTask) => {
    setSavingId(task.id);
    const value = (notes[task.id] ?? '').trim();
    const result = await updateTask(task.id, { assignee_notes: value || null });
    setSavingId(null);
    toast(result.message, result.ok ? 'success' : 'error');
  };

  const beginEdit = (task: DelegatedTask) => {
    setEditingId(task.id);
    setEditDraft({
      assigned_to: task.assigned_to,
      due_at: toDelegatedDueInput(task.due_at),
      request: task.description ? `${task.title}\n${task.description}` : task.title,
    });
  };

  const saveEdit = async (task: DelegatedTask) => {
    if (editDraft.due_at && !delegatedTaskDueAt(editDraft.due_at)) {
      toast('Enter a valid due date and time, or leave it blank.', 'warning');
      return;
    }
    setSavingId(task.id);
    const result = await updateTask(task.id, {
      assigned_to: editDraft.assigned_to || task.assigned_to,
      due_at: delegatedTaskDueAt(editDraft.due_at),
      request: editDraft.request,
    });
    setSavingId(null);
    toast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) setEditingId(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSavingId(deleteTarget.id);
    const result = await deleteTask(deleteTarget.id);
    setSavingId(null);
    setDeleteTarget(null);
    toast(result.message, result.ok ? 'success' : 'error');
  };

  const renderTask = (task: DelegatedTask) => {
    const completed = task.status === 'Completed';
    const overdue = isDelegatedTaskOverdue(task);
    const canComplete = canCompleteDelegatedTask(task, viewer);
    const canEdit = canEditDelegatedTask(task, viewer);
    const canAnnotate = canAnnotateDelegatedTask(task, viewer);
    const editing = editingId === task.id;
    const busy = savingId === task.id;
    const mine = task.assigned_to === profile?.id;
    return (
      <div
        key={task.id}
        data-delegated-task={task.id}
        className={cn('p-3 transition-colors', completed && 'opacity-90')}
      >
        <div className="flex items-start gap-3">
          <input
            aria-label={`Mark ${task.title} ${completed ? 'incomplete' : 'completed'}`}
            type="checkbox"
            checked={completed}
            disabled={!canComplete || busy}
            onChange={event => void toggleComplete(task, event.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-ink-600 text-brand-500 focus:ring-brand-500 disabled:opacity-50"
          />
          <div className="min-w-0 flex-1">
            {editing ? (
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400 sm:col-span-1">
                  Assign to
                  <select aria-label="Edit assignee" value={editDraft.assigned_to} onChange={event => setEditDraft(draft => ({ ...draft, assigned_to: event.target.value }))} className={fieldClass}>
                    {staff.map(person => <option key={person.id} value={person.id}>{personName(person)}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">
                  Due date and time (optional)
                  <input aria-label="Edit due date and time" type="datetime-local" value={editDraft.due_at} onChange={event => setEditDraft(draft => ({ ...draft, due_at: event.target.value }))} className={fieldClass} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400 sm:col-span-2">
                  Please Complete
                  <textarea aria-label="Edit task text" rows={3} value={editDraft.request} onChange={event => setEditDraft(draft => ({ ...draft, request: event.target.value }))} className={cn(fieldClass, 'resize-y')} />
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <button type="button" disabled={busy} onClick={() => void saveEdit(task)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-50"><Save className="h-3.5 w-3.5" /> Save changes</button>
                  <button type="button" onClick={() => setEditingId(null)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 px-3 py-2 text-xs font-semibold text-ink-300 hover:bg-ink-800"><X className="h-3.5 w-3.5" /> Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className={cn('text-sm text-ink-100', completed && 'text-ink-500 line-through')}>
                    <span className="font-bold">{personName(task.assigned)}</span>
                    {' — '}
                    <span className="font-semibold">{task.title}</span>
                  </p>
                  {task.description && (
                    <p className={cn('mt-1 whitespace-pre-wrap text-sm text-ink-300', completed && 'text-ink-500')}>{task.description}</p>
                  )}
                  <p className="mt-1 text-xs text-ink-500">
                    <span className="font-medium text-ink-400">{personName(task.sender, 'Someone')}</span>
                    {' → '}
                    <span className="font-medium text-ink-400">{mine ? 'You' : personName(task.assigned)}</span>
                    {' · '}
                    <span className={cn(overdue && 'font-semibold text-red-400')}>{formatDelegatedDue(task.due_at)}</span>
                    {' · Sent '}{new Date(task.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    {task.proof_required && !completed && <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-400"><Camera className="h-3 w-3" /> Photo required</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2 self-start">
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                    completed ? 'bg-emerald-500/10 text-emerald-400' : overdue ? 'bg-red-500/10 text-red-400' : 'bg-amber-500/10 text-amber-400',
                  )}>
                    {completed ? <CheckCircle2 className="h-3 w-3" /> : overdue ? <AlertTriangle className="h-3 w-3" /> : null}
                    {completed ? DELEGATED_STATUS_LABELS.completed : overdue ? 'Missed Task' : DELEGATED_STATUS_LABELS.incomplete}
                  </span>
                  {canEdit && !completed && (
                    <button type="button" aria-label={`Nudge ${personName(task.assigned)} about ${task.title}`} title="Send a reminder" disabled={busy} onClick={() => void nudge(task)} className="rounded-md p-1.5 text-ink-500 hover:bg-amber-500/10 hover:text-amber-400 disabled:opacity-50"><BellRing className="h-3.5 w-3.5" /></button>
                  )}
                  {canEdit && (
                    <>
                      <button type="button" aria-label={`Edit ${task.title}`} title="Edit task" disabled={busy} onClick={() => beginEdit(task)} className="rounded-md p-1.5 text-ink-500 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-50"><Pencil className="h-3.5 w-3.5" /></button>
                      <button type="button" aria-label={`Delete ${task.title}`} title="Delete task" disabled={busy} onClick={() => setDeleteTarget(task)} className="rounded-md p-1.5 text-ink-500 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </div>
              </div>
            )}
            {completed && task.completed_at && !editing && (
              <p className="mt-1 text-xs text-emerald-400">Completed {new Date(task.completed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
            )}
            {task.proof_photo_path && !editing && (
              proofUrls[task.id]
                ? <a href={proofUrls[task.id]} target="_blank" rel="noreferrer" className="mt-2 inline-block"><img src={proofUrls[task.id]} alt={`Photo proof for ${task.title}`} className="h-20 w-28 rounded-md border border-ink-700 object-cover" /></a>
                : <p className="mt-2 text-xs text-ink-500">Loading photo…</p>
            )}
            {!editing && (canAnnotate || task.assignee_notes) && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-ink-400">
                  Notes
                  <textarea
                    aria-label={`Notes for ${task.title}`}
                    rows={2}
                    maxLength={DELEGATED_NOTES_MAX}
                    disabled={!canAnnotate}
                    value={notes[task.id] ?? ''}
                    onChange={event => setNotes(current => ({ ...current, [task.id]: event.target.value }))}
                    placeholder={canAnnotate ? 'Add progress or completion notes' : 'No notes added'}
                    className={cn(fieldClass, 'resize-y bg-ink-900 disabled:opacity-70')}
                  />
                </label>
                {canAnnotate && (
                  <button
                    type="button"
                    disabled={busy || (notes[task.id] ?? '').trim() === (task.assignee_notes ?? '')}
                    onClick={() => void saveNotes(task)}
                    className="flex items-center justify-center gap-2 rounded-lg border border-ink-600 px-3 py-2 text-xs font-semibold text-ink-200 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Save className="h-3.5 w-3.5" /> Save notes
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderAssigneeGroup = ({ assignedTo, tasks: assigneeTasks }: { assignedTo: string; tasks: DelegatedTask[] }) => {
    const assignee = assigneeTasks[0]?.assigned;
    const name = personName(assignee);
    const hasOverdueTask = assigneeTasks.some(task => isDelegatedTaskOverdue(task));
    return (
      <article
        key={assignedTo}
        data-delegated-assignee-group={assignedTo}
        aria-label={`${name} delegated tasks`}
        className={cn(
          'divide-y divide-ink-700 overflow-hidden rounded-lg border bg-ink-850/70',
          hasOverdueTask ? 'border-red-500/40' : 'border-ink-700',
        )}
      >
        {assigneeTasks.map(renderTask)}
      </article>
    );
  };

  return (
    <section className="dashboard-panel overflow-hidden rounded-xl border border-ink-700 bg-ink-900" aria-labelledby="delegated-tasks-heading">
      <div className="flex flex-col gap-3 border-b border-ink-700 bg-ink-850/70 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand-400" />
            <h2 id="delegated-tasks-heading" className="text-base font-semibold text-ink-100">Delegated Tasks</h2>
            {myOpenCount > 0 && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-400">{myOpenCount} for you</span>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {isOwner
              ? 'Delegate work to anyone, watch it get done, and review every teammate\'s history.'
              : 'Tasks sent to you, and tasks you have sent to teammates. Check a box when it is done.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isOwner ? (
            <select aria-label="Filter delegated tasks by staff" value={staffFilter} onChange={event => setStaffFilter(event.target.value)} className={chipClass}>
              <option value="">All Staff</option>
              {staff.map(person => <option key={person.id} value={person.id}>{personName(person)}</option>)}
            </select>
          ) : (
            <select aria-label="Choose which delegated tasks to show" value={view} onChange={event => setView(event.target.value as DelegatedTaskView)} className={chipClass}>
              <option value="assigned_to_me">Assigned to me</option>
              <option value="sent_by_me">Sent by me</option>
            </select>
          )}
          <select aria-label="Filter delegated tasks by completion" value={statusFilter} onChange={event => setStatusFilter(event.target.value as DelegatedTaskStatusFilter)} className={chipClass}>
            <option value="all">All Tasks</option>
            <option value="incomplete">All Incomplete</option>
            <option value="completed">All Complete</option>
          </select>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-3 border-b border-ink-700 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.8fr)_auto] lg:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">
          Assign to
          <select aria-label="Assign delegated task to teammate" required value={assignedTo} onChange={event => setAssignedTo(event.target.value)} className={fieldClass}>
            <option value="">Select teammate</option>
            {staff.map(person => (
              <option key={person.id} value={person.id}>{person.id === profile?.id ? `${personName(person)} (me)` : personName(person)}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">
          Due date and time (optional)
          <input aria-label="Delegated task due date and time" type="datetime-local" value={dueAt} onChange={event => setDueAt(event.target.value)} className={fieldClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">
          Please Complete
          <textarea
            aria-label="Please Complete"
            required
            rows={2}
            value={request}
            onChange={event => setRequest(event.target.value)}
            placeholder={'What needs to be done\nAdd details on the next line'}
            className={cn(fieldClass, 'resize-y')}
          />
        </label>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-ink-400">
            <input type="checkbox" checked={proofRequired} onChange={event => setProofRequired(event.target.checked)} className="h-4 w-4 rounded border-ink-600 text-brand-500 focus:ring-brand-500" />
            Require a photo to complete
          </label>
          <button type="submit" disabled={submitting} className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50">
            <Send className="h-4 w-4" /> {submitting ? 'Sending…' : 'Delegate task'}
          </button>
        </div>
      </form>
      <input ref={proofInputRef} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Photo proof" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void completeWithPhoto(file); }} />

      {error && (
        <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <span>Delegated tasks couldn't load. ({error})</span>
          <button type="button" onClick={() => void refresh()} className="font-semibold hover:text-red-200">Retry</button>
        </div>
      )}

      <div className="max-h-[36rem] overflow-y-auto p-4">
        {isLoading ? (
          <p className="py-5 text-center text-sm text-ink-500">Loading delegated tasks…</p>
        ) : visibleTasks.length === 0 ? (
          <p className="py-5 text-center text-sm text-ink-500">No delegated tasks match these filters.</p>
        ) : (
          <div className="space-y-5">
            {statusFilter !== 'completed' && (
              <section aria-label="Incomplete delegated tasks">
                <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  {DELEGATED_STATUS_LABELS.incomplete} <span className="rounded-full bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300">{sections.incomplete.length}</span>
                </h3>
                {sections.incomplete.length === 0
                  ? <p className="rounded-lg border border-dashed border-ink-700 px-3 py-4 text-center text-xs text-ink-500">Nothing outstanding.</p>
                  : <div className="space-y-3">{groupedSections.incomplete.map(renderAssigneeGroup)}</div>}
              </section>
            )}
            {statusFilter !== 'incomplete' && (
              <section aria-label="Completed delegated tasks">
                <h3 className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  {DELEGATED_STATUS_LABELS.completed} <span className="rounded-full bg-ink-800 px-1.5 py-0.5 text-[10px] text-ink-300">{sections.completed.length}</span>
                </h3>
                {sections.completed.length === 0
                  ? <p className="rounded-lg border border-dashed border-ink-700 px-3 py-4 text-center text-xs text-ink-500">Completed tasks stay here as history.</p>
                  : <div className="space-y-3">{groupedSections.completed.map(renderAssigneeGroup)}</div>}
              </section>
            )}
          </div>
        )}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-delegated-heading">
          <div className="w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl">
            <h3 id="delete-delegated-heading" className="text-lg font-bold text-ink-100">Delete this task?</h3>
            <p className="mt-2 text-sm text-ink-400">"{deleteTarget.title}" for {personName(deleteTarget.assigned)} will be removed for everyone. This cannot be undone.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteTarget(null)} className="rounded-lg border border-ink-600 px-3 py-2 text-sm font-semibold text-ink-300 hover:bg-ink-800">Keep it</button>
              <button type="button" disabled={savingId === deleteTarget.id} onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">Delete task</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
