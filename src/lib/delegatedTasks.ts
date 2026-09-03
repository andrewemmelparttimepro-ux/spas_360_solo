import type { TaskStatus } from '@/types/database';

export const DELEGATED_TASK_TYPE = 'Delegated' as const;

export type DelegatedTaskStatusFilter = 'all' | 'not_completed' | 'completed';

export interface DelegatedTaskFilterItem {
  assigned_to: string;
  status: TaskStatus;
}

export function checklistItems(value: string): string[] {
  return [...new Set(
    value
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean),
  )];
}

export function filterDelegatedTasks<T extends DelegatedTaskFilterItem>(
  tasks: T[],
  assignedTo: string,
  status: DelegatedTaskStatusFilter,
): T[] {
  return tasks.filter(task => {
    if (assignedTo && task.assigned_to !== assignedTo) return false;
    if (status === 'completed') return task.status === 'Completed';
    if (status === 'not_completed') return task.status !== 'Completed';
    return true;
  });
}

export function delegatedTaskDueAt(localDateTime: string): string | null {
  if (!localDateTime) return null;
  const dueAt = new Date(localDateTime);
  return Number.isNaN(dueAt.getTime()) ? null : dueAt.toISOString();
}
