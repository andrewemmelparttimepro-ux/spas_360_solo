import type { Profile, Task } from '@/types/database';

export const ALL_TASK_OWNERS = 'all' as const;

export type TaskOwnerFilter = typeof ALL_TASK_OWNERS | string;

export type TaskOwnerOption = Pick<Profile, 'id' | 'first_name' | 'last_name'>;

export interface UpcomingTaskItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  assignedTo: string;
  assignedName: string;
  link: string;
}

export function taskOwnerName(owner: TaskOwnerOption): string {
  const fullName = `${owner.first_name} ${owner.last_name}`.trim();
  return fullName || 'Unnamed owner';
}

export function filterUpcomingTasks(
  tasks: UpcomingTaskItem[],
  ownerId: TaskOwnerFilter,
): UpcomingTaskItem[] {
  if (ownerId === ALL_TASK_OWNERS) return tasks;
  return tasks.filter(task => task.assignedTo === ownerId);
}

export function upcomingTaskLink(task: Pick<Task, 'deal_id' | 'contact_id' | 'job_id'>): string {
  if (task.deal_id) return `/deals/${task.deal_id}`;
  if (task.contact_id) return `/customers/${task.contact_id}`;
  if (task.job_id) return `/service/${task.job_id}`;
  return '/dashboard';
}
