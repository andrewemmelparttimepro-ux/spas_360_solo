import type { TaskStatus, UserRole } from '@/types/database';

// Delegated Tasks are human-to-human staff tasks (Brandon's "Please Complete"
// checklist). Any teammate can send one to any teammate; only the sender (or an
// owner) can edit or delete it; the assignee checks it complete; completed items
// are kept forever as history.
export const DELEGATED_TASK_TYPE = 'Delegated' as const;
export const DELEGATED_TITLE_MAX = 200;
export const DELEGATED_DESCRIPTION_MAX = 4000;
export const DELEGATED_NOTES_MAX = 4000;

export type DelegatedTaskStatusFilter = 'all' | 'incomplete' | 'completed';
export type DelegatedTaskView = 'assigned_to_me' | 'sent_by_me' | 'everyone';

export const DELEGATED_STATUS_LABELS: Record<Exclude<DelegatedTaskStatusFilter, 'all'>, string> = {
  incomplete: 'Incomplete',
  completed: 'Completed',
};

export interface DelegatedTaskFilterItem {
  assigned_to: string;
  created_by: string;
  status: TaskStatus;
  due_at: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface DelegatedViewer {
  id: string;
  role: UserRole | null | undefined;
}

export interface DelegatedTaskAssigneeGroup<T extends Pick<DelegatedTaskFilterItem, 'assigned_to'>> {
  assignedTo: string;
  tasks: T[];
}

/**
 * The "Please Complete" box is free text: the first line is the task, anything
 * after it is the detail. Overlong first lines are broken at a word boundary so
 * nothing the sender typed is lost.
 */
export function parseDelegatedRequest(value: string): { title: string; description: string | null } | null {
  const lines = value.replace(/\r/g, '').split('\n').map(line => line.trim());
  const firstIndex = lines.findIndex(Boolean);
  if (firstIndex < 0) return null;
  let title = lines[firstIndex];
  let rest = lines.slice(firstIndex + 1).join('\n').trim();
  if (title.length > DELEGATED_TITLE_MAX) {
    const cut = title.slice(0, DELEGATED_TITLE_MAX);
    const breakAt = cut.lastIndexOf(' ');
    const head = breakAt > 60 ? cut.slice(0, breakAt) : cut;
    rest = `${title.slice(head.length).trim()}${rest ? `\n${rest}` : ''}`.trim();
    title = head.trim();
  }
  return { title, description: rest ? rest.slice(0, DELEGATED_DESCRIPTION_MAX) : null };
}

export function isDelegatedTaskCompleted(task: Pick<DelegatedTaskFilterItem, 'status'>): boolean {
  return task.status === 'Completed';
}

export function isDelegatedTaskOverdue(task: Pick<DelegatedTaskFilterItem, 'status' | 'due_at'>, now: Date = new Date()): boolean {
  if (isDelegatedTaskCompleted(task) || !task.due_at) return false;
  const due = new Date(task.due_at).getTime();
  return Number.isFinite(due) && due < now.getTime();
}

export function filterDelegatedTasks<T extends DelegatedTaskFilterItem>(
  tasks: T[],
  options: { view: DelegatedTaskView; userId: string; assignedTo?: string; status: DelegatedTaskStatusFilter },
): T[] {
  return tasks.filter(task => {
    if (options.view === 'assigned_to_me' && task.assigned_to !== options.userId) return false;
    if (options.view === 'sent_by_me' && task.created_by !== options.userId) return false;
    if (options.assignedTo && task.assigned_to !== options.assignedTo) return false;
    if (options.status === 'completed') return isDelegatedTaskCompleted(task);
    if (options.status === 'incomplete') return !isDelegatedTaskCompleted(task);
    return true;
  });
}

function dueOrder(task: DelegatedTaskFilterItem): number {
  if (!task.due_at) return Number.POSITIVE_INFINITY;
  const value = new Date(task.due_at).getTime();
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

/**
 * Incomplete first (soonest due first, undated last, then newest), then the
 * permanent Completed history (most recently completed first).
 */
export function splitDelegatedSections<T extends DelegatedTaskFilterItem>(tasks: T[]): { incomplete: T[]; completed: T[] } {
  const incomplete = tasks
    .filter(task => !isDelegatedTaskCompleted(task))
    .sort((a, b) => dueOrder(a) - dueOrder(b) || b.created_at.localeCompare(a.created_at));
  const completed = tasks
    .filter(isDelegatedTaskCompleted)
    .sort((a, b) => (b.completed_at ?? b.created_at).localeCompare(a.completed_at ?? a.created_at));
  return { incomplete, completed };
}

/**
 * Keep each employee's filtered tasks together without disturbing the order
 * established by splitDelegatedSections. The first task for an assignee fixes
 * that employee group's position and later tasks join the same group.
 */
export function groupDelegatedTasksByAssignee<T extends Pick<DelegatedTaskFilterItem, 'assigned_to'>>(
  tasks: T[],
): DelegatedTaskAssigneeGroup<T>[] {
  const groups = new Map<string, T[]>();
  tasks.forEach(task => {
    const group = groups.get(task.assigned_to);
    if (group) group.push(task);
    else groups.set(task.assigned_to, [task]);
  });
  return Array.from(groups, ([assignedTo, groupedTasks]) => ({ assignedTo, tasks: groupedTasks }));
}

export function delegatedTaskDueAt(localDateTime: string): string | null {
  if (!localDateTime) return null;
  const dueAt = new Date(localDateTime);
  return Number.isNaN(dueAt.getTime()) ? null : dueAt.toISOString();
}

export function toDelegatedDueInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function formatDelegatedDue(iso: string | null): string {
  if (!iso) return 'No due time';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'No due time';
  return `Due ${date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`;
}

export function canEditDelegatedTask(task: Pick<DelegatedTaskFilterItem, 'created_by'>, viewer: DelegatedViewer | null | undefined): boolean {
  if (!viewer) return false;
  return task.created_by === viewer.id || viewer.role === 'owner_manager';
}

export function canCompleteDelegatedTask(
  task: Pick<DelegatedTaskFilterItem, 'assigned_to' | 'created_by'>,
  viewer: DelegatedViewer | null | undefined,
): boolean {
  if (!viewer) return false;
  return task.assigned_to === viewer.id || task.created_by === viewer.id || viewer.role === 'owner_manager';
}

export function canAnnotateDelegatedTask(
  task: Pick<DelegatedTaskFilterItem, 'assigned_to'>,
  viewer: DelegatedViewer | null | undefined,
): boolean {
  if (!viewer) return false;
  return task.assigned_to === viewer.id || viewer.role === 'owner_manager';
}

export function defaultDelegatedView(role: UserRole | null | undefined): DelegatedTaskView {
  return role === 'owner_manager' ? 'everyone' : 'assigned_to_me';
}
