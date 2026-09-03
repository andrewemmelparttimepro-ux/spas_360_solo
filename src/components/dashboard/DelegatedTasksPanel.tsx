import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Plus, Save } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useDelegatedTasks } from '@/hooks/useDelegatedTasks';
import {
  checklistItems,
  delegatedTaskDueAt,
  filterDelegatedTasks,
  type DelegatedTaskStatusFilter,
} from '@/lib/delegatedTasks';
import { cn } from '@/lib/utils';

const staffName = (staff: { first_name: string; last_name: string }) =>
  `${staff.first_name} ${staff.last_name}`.trim();

export default function DelegatedTasksPanel() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { tasks, staff, isLoading, error, createChecklist, updateTask, refresh } = useDelegatedTasks();
  const [staffFilter, setStaffFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<DelegatedTaskStatusFilter>('not_completed');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [items, setItems] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const isOwner = profile?.role === 'owner_manager';

  useEffect(() => {
    setNotes(current => {
      const next = { ...current };
      tasks.forEach(task => {
        if (!(task.id in next)) next[task.id] = task.assignee_notes ?? '';
      });
      return next;
    });
  }, [tasks]);

  const visibleTasks = useMemo(
    () => filterDelegatedTasks(tasks, staffFilter, statusFilter),
    [tasks, staffFilter, statusFilter],
  );

  const submitChecklist = async (event: FormEvent) => {
    event.preventDefault();
    const titles = checklistItems(items);
    const due = delegatedTaskDueAt(dueAt);
    if (!assignedTo || !due || titles.length === 0) {
      toast('Choose staff, a due date and time, and at least one checklist item.', 'warning');
      return;
    }
    setSubmitting(true);
    const result = await createChecklist({ assigned_to: assignedTo, due_at: due, titles });
    setSubmitting(false);
    toast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) setItems('');
  };

  const toggleComplete = async (id: string, completed: boolean) => {
    setSavingId(id);
    const result = await updateTask(id, { status: completed ? 'Completed' : 'Pending' });
    setSavingId(null);
    toast(result.message, result.ok ? 'success' : 'error');
  };

  const saveNotes = async (id: string) => {
    setSavingId(id);
    const value = notes[id]?.trim() ?? '';
    const result = await updateTask(id, { assignee_notes: value || null });
    setSavingId(null);
    toast(result.message, result.ok ? 'success' : 'error');
  };

  return (
    <section className="dashboard-panel overflow-hidden rounded-xl border border-ink-700 bg-ink-900" aria-labelledby="delegated-tasks-heading">
      <div className="flex flex-col gap-3 border-b border-ink-700 bg-ink-850/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-brand-400" />
            <h2 id="delegated-tasks-heading" className="text-base font-semibold text-ink-100">Delegated Tasks</h2>
          </div>
          <p className="mt-1 text-xs text-ink-500">
            {isOwner ? 'Assign a dated checklist and follow completion in real time.' : 'Your assigned checklist, due times, and notes.'}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {isOwner && (
            <select
              aria-label="Filter delegated tasks by staff"
              value={staffFilter}
              onChange={event => setStaffFilter(event.target.value)}
              className="min-w-0 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-xs font-medium text-ink-200 outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">All Staff</option>
              {staff.map(person => <option key={person.id} value={person.id}>{staffName(person)}</option>)}
            </select>
          )}
          <select
            aria-label="Filter delegated tasks by completion"
            value={statusFilter}
            onChange={event => setStatusFilter(event.target.value as DelegatedTaskStatusFilter)}
            className="min-w-0 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-xs font-medium text-ink-200 outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="all">All Statuses</option>
            <option value="not_completed">Not Completed</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {isOwner && (
        <form onSubmit={submitChecklist} className="grid gap-3 border-b border-ink-700 p-4 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1.6fr)_auto] lg:items-end">
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">
            Assign to
            <select
              aria-label="Assign delegated checklist to staff"
              required
              value={assignedTo}
              onChange={event => setAssignedTo(event.target.value)}
              className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2.5 text-sm font-normal text-ink-100 outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">Select staff</option>
              {staff.map(person => <option key={person.id} value={person.id}>{staffName(person)}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">
            Due date and time
            <input
              aria-label="Delegated checklist due date and time"
              type="datetime-local"
              required
              value={dueAt}
              onChange={event => setDueAt(event.target.value)}
              className="rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-normal text-ink-100 outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-ink-400">
            Checklist items
            <textarea
              aria-label="Delegated checklist items"
              required
              rows={2}
              value={items}
              onChange={event => setItems(event.target.value)}
              placeholder={'One item per line\nConfirm delivery window'}
              className="resize-y rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-normal text-ink-100 outline-none placeholder:text-ink-600 focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {submitting ? 'Assigning…' : 'Assign checklist'}
          </button>
        </form>
      )}

      {error && (
        <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          <span>Delegated tasks couldn’t load. ({error})</span>
          <button type="button" onClick={() => void refresh()} className="font-semibold hover:text-red-200">Retry</button>
        </div>
      )}

      <div className="max-h-[32rem] space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <p className="py-5 text-center text-sm text-ink-500">Loading delegated tasks…</p>
        ) : visibleTasks.length === 0 ? (
          <p className="py-5 text-center text-sm text-ink-500">No delegated tasks match these filters.</p>
        ) : visibleTasks.map(task => {
          const completed = task.status === 'Completed';
          const canUpdate = task.assigned_to === profile?.id;
          return (
            <article key={task.id} className="rounded-lg border border-ink-700 bg-ink-850/70 p-3">
              <div className="flex items-start gap-3">
                <input
                  aria-label={`Mark ${task.title} ${completed ? 'not completed' : 'completed'}`}
                  type="checkbox"
                  checked={completed}
                  disabled={!canUpdate || savingId === task.id}
                  onChange={event => void toggleComplete(task.id, event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-ink-600 text-brand-500 focus:ring-brand-500 disabled:opacity-50"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className={cn('text-sm font-medium text-ink-100', completed && 'text-ink-500 line-through')}>{task.title}</p>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {staffName(task.assigned ?? { first_name: 'Assigned', last_name: 'staff' })} · Due {new Date(task.due_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </p>
                    </div>
                    <span className={cn(
                      'inline-flex shrink-0 items-center gap-1 self-start rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                      completed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400',
                    )}>
                      {completed && <CheckCircle2 className="h-3 w-3" />}
                      {completed ? 'Completed' : 'Not Completed'}
                    </span>
                  </div>
                  {completed && task.completed_at && (
                    <p className="mt-1 text-xs text-emerald-400">Completed {new Date(task.completed_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</p>
                  )}
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
                    <label className="flex flex-1 flex-col gap-1 text-xs font-semibold text-ink-400">
                      Assignee notes
                      <textarea
                        aria-label={`Notes for ${task.title}`}
                        rows={2}
                        maxLength={4000}
                        disabled={!canUpdate}
                        value={notes[task.id] ?? ''}
                        onChange={event => setNotes(current => ({ ...current, [task.id]: event.target.value }))}
                        placeholder={canUpdate ? 'Add progress or completion notes' : 'No notes added'}
                        className="resize-y rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm font-normal text-ink-100 outline-none placeholder:text-ink-600 focus:ring-2 focus:ring-brand-500 disabled:opacity-70"
                      />
                    </label>
                    {canUpdate && (
                      <button
                        type="button"
                        disabled={savingId === task.id || (notes[task.id] ?? '').trim() === (task.assignee_notes ?? '')}
                        onClick={() => void saveNotes(task.id)}
                        className="flex items-center justify-center gap-2 rounded-lg border border-ink-600 px-3 py-2 text-xs font-semibold text-ink-200 hover:bg-ink-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Save className="h-3.5 w-3.5" /> Save notes
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
