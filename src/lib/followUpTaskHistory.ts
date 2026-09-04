import type { Task } from '@/types/database';

export type FollowUpHistoryTask = Pick<
  Task,
  'status' | 'was_overdue_at_completion' | 'overdue_due_at'
>;

export function isCompletedLateFollowUp(task: FollowUpHistoryTask) {
  return task.status === 'Completed'
    && task.was_overdue_at_completion
    && Boolean(task.overdue_due_at);
}
