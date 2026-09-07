import type { Task, Profile } from '../types/database.ts';
import { canAnnotateDelegatedTask, canCompleteDelegatedTask, canEditDelegatedTask, delegatedTaskDueAt, toDelegatedDueInput } from './delegatedTasks.ts';

export type SummaryTaskPatch = Partial<Pick<Task, 'title' | 'description' | 'assigned_to' | 'due_at' | 'priority' | 'status' | 'assignee_notes' | 'proof_required'>>;
export type SummaryTaskDraft = Omit<Required<SummaryTaskPatch>, 'description' | 'assignee_notes' | 'due_at'> & { description: string; assignee_notes: string; due_at: string };

export function summaryTaskPermissions(task: Task, viewer: Pick<Profile, 'id' | 'role' | 'org_id'>) {
  if (task.was_overdue_at_completion || task.org_id !== viewer.org_id) return { definition: false, completion: false, notes: false, reassign: false };
  if (task.task_type === 'Delegated') return {
    definition: canEditDelegatedTask(task, viewer), completion: canCompleteDelegatedTask(task, viewer),
    notes: canAnnotateDelegatedTask(task, viewer), reassign: canEditDelegatedTask(task, viewer),
  };
  const manager = viewer.role === 'owner_manager' || viewer.role === 'service_manager';
  const allowed = viewer.role !== 'technician' && (task.assigned_to === viewer.id || manager);
  return { definition: allowed, completion: allowed, notes: allowed, reassign: manager };
}

export function summaryTaskDraft(task: Task): SummaryTaskDraft {
  return { title: task.title, description: task.description ?? '', assigned_to: task.assigned_to,
    due_at: toDelegatedDueInput(task.due_at), priority: task.priority, status: task.status,
    assignee_notes: task.assignee_notes ?? '', proof_required: task.proof_required };
}

/** Diff displayed values first so opening an editor never truncates timestamp precision. */
export function summaryTaskPatch(task: Task, draft: SummaryTaskDraft): SummaryTaskPatch {
  const initial = summaryTaskDraft(task);
  const patch: SummaryTaskPatch = {};
  if (draft.title !== initial.title) {
    if (!draft.title.trim()) throw new Error('Enter a task title before closing.');
    patch.title = draft.title.trim();
  }
  if (draft.description !== initial.description) patch.description = draft.description.trim() || null;
  if (draft.assignee_notes !== initial.assignee_notes) patch.assignee_notes = draft.assignee_notes.trim() || null;
  if (draft.assigned_to !== initial.assigned_to) patch.assigned_to = draft.assigned_to;
  if (draft.priority !== initial.priority) patch.priority = draft.priority;
  if (draft.status !== initial.status) patch.status = draft.status;
  if (draft.proof_required !== initial.proof_required) patch.proof_required = draft.proof_required;
  if (draft.due_at !== initial.due_at) {
    const due = delegatedTaskDueAt(draft.due_at);
    if (draft.due_at && !due) throw new Error('Enter a valid due date and time before closing.');
    if (!due && task.task_type !== 'Delegated') throw new Error('This task needs a due date and time.');
    patch.due_at = due;
  }
  for (const key of Object.keys(patch) as (keyof SummaryTaskPatch)[]) {
    if (patch[key] === task[key]) delete patch[key];
  }
  return patch;
}

/** All dialog close gestures share one flight; rejection leaves the caller's draft intact. */
export function createSummaryTaskCloser() {
  let pending: Promise<void> | null = null;
  return (task: Task, draft: SummaryTaskDraft, save: (patch: SummaryTaskPatch) => Promise<void>, close: () => void): Promise<void> => {
    if (pending) return pending;
    pending = Promise.resolve().then(async () => {
      const patch = summaryTaskPatch(task, draft);
      if (Object.keys(patch).length > 0) await save(patch);
      close();
    }).finally(() => { pending = null; });
    return pending;
  };
}
