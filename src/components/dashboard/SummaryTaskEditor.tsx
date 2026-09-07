import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useModal } from '@/hooks/useModal';
import { signedProofUrl } from '@/hooks/useDelegatedTasks';
import { supabase } from '@/lib/supabase';
import { createSummaryTaskCloser, summaryTaskDraft, summaryTaskPermissions, type SummaryTaskDraft } from '@/lib/summaryTaskEditor';
import type { Profile, Task } from '@/types/database';

const fieldClass = 'mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 disabled:opacity-70';
type Staff = Pick<Profile, 'id' | 'first_name' | 'last_name'>;
const name = (person: Staff | undefined) => person ? `${person.first_name} ${person.last_name}`.trim() : 'Unavailable';
const stamp = (value: string | null) => value ? new Date(value).toLocaleString() : 'None';

export default function SummaryTaskEditor({ taskId, onClose, onSaved }: { taskId: string; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [draft, setDraft] = useState<SummaryTaskDraft | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const closer = useRef(createSummaryTaskCloser());
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    if (!profile) return;
    void (async () => {
      try {
        const [taskResult, staffResult] = await Promise.all([
          supabase.from('tasks').select('*').eq('id', taskId).eq('org_id', profile.org_id).single(),
          supabase.from('profiles').select('id, first_name, last_name').eq('org_id', profile.org_id).order('first_name'),
        ]);
        if (cancelled) return;
        if (taskResult.error) throw new Error('This task is unavailable or you no longer have access to its details.');
        if (staffResult.error) throw staffResult.error;
        const loaded = taskResult.data as Task;
        setTask(loaded); setDraft(summaryTaskDraft(loaded)); setStaff(staffResult.data ?? []);
        if (loaded.proof_photo_path) {
          const url = await signedProofUrl(loaded.proof_photo_path);
          if (!cancelled) setProofUrl(url);
        }
      } catch (failure) { if (!cancelled) setError(failure instanceof Error ? failure.message : 'Task details could not load.'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [taskId, profile?.org_id]);

  const requestClose = () => {
    if (busy.current) return;
    if (!task || !draft) { onClose(); return; }
    busy.current = true; setSaving(true); setError(null);
    void closer.current(task, draft, async patch => {
      const { error: saveError } = await supabase.rpc('update_summary_task', {
        p_task_id: task.id, p_expected_updated_at: task.updated_at, p_patch: patch,
      });
      if (saveError) throw new Error(saveError.message);
      onSaved();
    }, onClose).catch(failure => {
      setError(failure instanceof Error ? failure.message : 'Save failed. Your edits are still here. Try closing again to retry.');
    }).finally(() => { busy.current = false; setSaving(false); });
  };
  const { dialogRef, dialogProps } = useModal(requestClose);
  const permissions = task && profile ? summaryTaskPermissions(task, profile) : null;
  const change = <K extends keyof SummaryTaskDraft>(key: K, value: SummaryTaskDraft[K]) => setDraft(current => current ? { ...current, [key]: value } : current);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 p-3" onClick={event => { if (event.target === event.currentTarget) requestClose(); }}>
      <div ref={dialogRef} {...dialogProps} aria-labelledby="summary-task-title" aria-describedby="summary-task-save-help" aria-busy={saving || loading} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-xl border border-ink-700 bg-ink-850 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="summary-task-title" className="text-lg font-semibold text-ink-100">Task details</h2>
          <button type="button" aria-label="Save and close task details" disabled={saving} onClick={requestClose} className="rounded-lg p-2 text-ink-400 hover:bg-ink-700 hover:text-ink-100"><X className="h-5 w-5" /></button>
        </div>
        <p id="summary-task-save-help" className="mt-1 text-xs text-ink-400">{task?.was_overdue_at_completion ? 'This overdue follow-up was completed and is preserved as permanent history.' : 'Changes save when you close. The assigned teammate is notified of edits.'}</p>
        {loading && <p role="status" className="mt-4 text-sm text-ink-300">Loading task details…</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}{task && ' Your edits are still here.'}</p>}
        {task && draft && permissions && (
          <div className="mt-4 space-y-4 text-sm text-ink-300">
            <p className="text-xs text-ink-400">Current task details · {task.task_type ?? 'Task'}</p>
            {!permissions.definition && !task.was_overdue_at_completion && <p className="text-xs text-amber-300">Only the sender or an owner can edit this delegated task's instructions.</p>}
            <fieldset>
              <label className="block">Title<input className={fieldClass} disabled={saving || !permissions.definition} value={draft.title} maxLength={task.task_type === 'Delegated' ? 200 : undefined} onChange={e => change('title', e.target.value)} /></label>
              <label className="mt-3 block">Description<textarea className={fieldClass} disabled={saving || !permissions.definition} rows={4} maxLength={4000} value={draft.description} onChange={e => change('description', e.target.value)} /></label>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label>Assigned to<select className={fieldClass} disabled={saving || !permissions.reassign} value={draft.assigned_to} onChange={e => change('assigned_to', e.target.value)}>{staff.map(person => <option key={person.id} value={person.id}>{name(person)}</option>)}</select></label>
                <label>Due date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})<input type="datetime-local" className={fieldClass} disabled={saving || !permissions.definition} value={draft.due_at} onChange={e => change('due_at', e.target.value)} /></label>
                <label>Priority<select className={fieldClass} disabled={saving || !permissions.definition} value={draft.priority} onChange={e => change('priority', e.target.value as Task['priority'])}>{['High', 'Medium', 'Low'].map(value => <option key={value}>{value}</option>)}</select></label>
              </div>
              {task.task_type === 'Delegated' && <label className="mt-3 flex items-center gap-2"><input type="checkbox" disabled={saving || !permissions.definition} checked={draft.proof_required} onChange={e => change('proof_required', e.target.checked)} />Photo required to complete</label>}
            </fieldset>
            <label className="block">Status<select className={fieldClass} disabled={saving || !permissions.completion} value={draft.status} onChange={e => change('status', e.target.value as Task['status'])}>{['Pending', 'In Progress', 'Completed', 'Overdue'].map(value => <option key={value} disabled={value === 'Completed' && draft.proof_required && !task.proof_photo_path && task.status !== 'Completed'}>{value}</option>)}</select></label>
            {draft.proof_required && !task.proof_photo_path && <p className="text-xs text-amber-300">Add a completion photo in Delegated Tasks before marking this task complete.</p>}
            <label className="block">Assignee notes<textarea className={fieldClass} rows={3} maxLength={4000} disabled={saving || !permissions.notes} value={draft.assignee_notes} onChange={e => change('assignee_notes', e.target.value)} /></label>
            <dl className="grid grid-cols-1 gap-2 border-t border-ink-700 pt-3 text-xs sm:grid-cols-2">
              <div><dt className="text-ink-500">Created by</dt><dd>{name(staff.find(person => person.id === task.created_by))}</dd></div>
              <div><dt className="text-ink-500">Created</dt><dd>{stamp(task.created_at)}</dd></div>
              <div><dt className="text-ink-500">Last updated</dt><dd>{stamp(task.updated_at)}</dd></div>
              <div><dt className="text-ink-500">Completed</dt><dd>{stamp(task.completed_at)}</dd></div>
              {task.contact_id && <div><dt className="text-ink-500">Customer</dt><dd><a className="underline" href={`/customers/${task.contact_id}`} target="_blank" rel="noreferrer">View linked customer</a></dd></div>}
              {task.deal_id && <div><dt className="text-ink-500">Deal</dt><dd><a className="underline" href={`/deals/${task.deal_id}`} target="_blank" rel="noreferrer">View linked deal</a></dd></div>}
              {task.job_id && <div><dt className="text-ink-500">Job</dt><dd><a className="underline" href={`/service/${task.job_id}`} target="_blank" rel="noreferrer">View linked job</a></dd></div>}
              {task.was_overdue_at_completion && <div><dt className="text-ink-500">Completed after deadline</dt><dd>{stamp(task.overdue_due_at)}</dd></div>}
              {task.nudged_at && <div><dt className="text-ink-500">Last reminder</dt><dd>{stamp(task.nudged_at)}</dd></div>}
              {task.escalated_at && <div><dt className="text-ink-500">Escalated</dt><dd>{stamp(task.escalated_at)}</dd></div>}
              {task.proof_photo_path && <div><dt className="text-ink-500">Completion photo</dt><dd>{proofUrl ? <a className="underline" href={proofUrl} target="_blank" rel="noreferrer">View photo</a> : 'Photo unavailable'}</dd></div>}
            </dl>
          </div>
        )}
        <div className="mt-5 flex justify-end gap-3">{error && task && <button type="button" disabled={saving} onClick={onClose} className="rounded-lg border border-ink-700 px-4 py-2 text-sm text-ink-300">Discard edits and close</button>}<button type="button" disabled={saving} onClick={requestClose} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{saving ? 'Saving…' : 'Close'}</button></div>
      </div>
    </div>, document.body,
  );
}
