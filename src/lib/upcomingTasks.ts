import type { Profile, Task, TaskStatus } from '@/types/database';

export const ALL_TASK_OWNERS = 'all' as const;
export const PAST_DUE_TASKS = 'past-due' as const;
export const NO_TASK_SCHEDULED = 'no-task-scheduled' as const;
export const THRAWN_PROFILE_ID = '79ea8493-7436-46ab-a210-26cccdac4f2e';

export type TaskOwnerFilter = typeof ALL_TASK_OWNERS | typeof PAST_DUE_TASKS | typeof NO_TASK_SCHEDULED | string;

export type TaskOwnerOption = Pick<Profile, 'id' | 'first_name' | 'last_name'>;

export interface UpcomingTaskItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  assignedTo: string;
  assignedName: string;
  dueAt: string | null;
  status: TaskStatus;
  dealId: string | null;
  link: string;
}

export interface OpenDealTaskCoverage {
  id: string;
  title: string;
  assignedTo: string;
  assignedName: string;
  link: string;
}

const INCOMPLETE_TASK_STATUSES: ReadonlySet<TaskStatus> = new Set([
  'Pending',
  'In Progress',
  'Overdue',
]);

export function taskOwnerName(owner: TaskOwnerOption): string {
  const fullName = `${owner.first_name} ${owner.last_name}`.trim();
  return fullName || 'Unnamed owner';
}

export function filterUpcomingTasks(
  tasks: UpcomingTaskItem[],
  ownerId: TaskOwnerFilter,
  now: Date = new Date(),
): UpcomingTaskItem[] {
  if (ownerId === ALL_TASK_OWNERS) return tasks;
  if (ownerId === PAST_DUE_TASKS) return tasks.filter(task => isPastDueTask(task, now));
  return tasks.filter(task => task.assignedTo === ownerId);
}

export function isPastDueTask(task: UpcomingTaskItem, now: Date = new Date()): boolean {
  if (!INCOMPLETE_TASK_STATUSES.has(task.status) || !task.dueAt) return false;
  const dueAt = new Date(task.dueAt);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < now.getTime();
}

export function dealsWithoutUpcomingTasks(
  deals: OpenDealTaskCoverage[],
  tasks: UpcomingTaskItem[],
  now: Date = new Date(),
): OpenDealTaskCoverage[] {
  const dealsWithUpcomingTasks = new Set(
    tasks
      .filter(task => task.dealId && isIncompleteFutureTask(task, now))
      .map(task => task.dealId as string),
  );
  return deals.filter(deal => !dealsWithUpcomingTasks.has(deal.id));
}

function isIncompleteFutureTask(task: UpcomingTaskItem, now: Date): boolean {
  if (!INCOMPLETE_TASK_STATUSES.has(task.status) || !task.dueAt) return false;
  const dueAt = new Date(task.dueAt);
  return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() >= now.getTime();
}

export function filterTaskOwnerOptions(owners: TaskOwnerOption[]): TaskOwnerOption[] {
  return owners.filter(owner => owner.id !== THRAWN_PROFILE_ID);
}

export function upcomingTaskLink(task: Pick<Task, 'deal_id' | 'contact_id' | 'job_id'>): string {
  if (task.deal_id) return `/deals/${task.deal_id}`;
  if (task.contact_id) return `/customers/${task.contact_id}`;
  if (task.job_id) return `/service/${task.job_id}`;
  return '/dashboard';
}
