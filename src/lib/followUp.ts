export type FollowUpState = 'missing' | 'overdue' | 'today' | 'scheduled';
export type FollowUpFilter = 'all' | 'missing' | 'overdue' | 'today';

export interface FollowUpTaskLike {
  id: string;
  deal_id: string | null;
  assigned_to: string;
  title: string;
  due_at: string;
  priority: string;
  status: string;
}

export interface DealFollowUp {
  id: string;
  dealId: string;
  assignedTo: string;
  title: string;
  dueAt: string;
  priority: string;
  status: string;
  openTaskCount: number;
}

const OPEN_TASK_STATUSES = new Set(['Pending', 'In Progress', 'Overdue']);

export function summarizeDealFollowUps(tasks: FollowUpTaskLike[]) {
  const grouped = new Map<string, DealFollowUp>();
  const openTasks = tasks
    // A task with an unparseable due date can't be anyone's "next activity" —
    // dropping it here keeps the stat row and the board's missing-state in agreement
    .filter((task) => task.deal_id && OPEN_TASK_STATUSES.has(task.status) && !Number.isNaN(new Date(task.due_at).getTime()))
    .sort((left, right) => new Date(left.due_at).getTime() - new Date(right.due_at).getTime());

  openTasks.forEach((task) => {
    const dealId = task.deal_id as string;
    const current = grouped.get(dealId);
    if (current) {
      current.openTaskCount += 1;
      return;
    }

    grouped.set(dealId, {
      id: task.id,
      dealId,
      assignedTo: task.assigned_to,
      title: task.title,
      dueAt: task.due_at,
      priority: task.priority,
      status: task.status,
      openTaskCount: 1,
    });
  });

  return grouped;
}

export function getFollowUpState(followUp: DealFollowUp | null | undefined, now = new Date()): FollowUpState {
  if (!followUp) return 'missing';

  const dueAt = new Date(followUp.dueAt);
  if (Number.isNaN(dueAt.getTime())) return 'missing';
  if (followUp.status === 'Overdue' || dueAt.getTime() < now.getTime()) return 'overdue';

  const sameDay =
    dueAt.getFullYear() === now.getFullYear()
    && dueAt.getMonth() === now.getMonth()
    && dueAt.getDate() === now.getDate();

  return sameDay ? 'today' : 'scheduled';
}

export function matchesFollowUpFilter(
  followUp: DealFollowUp | null | undefined,
  filter: FollowUpFilter,
  now = new Date(),
) {
  return filter === 'all' || getFollowUpState(followUp, now) === filter;
}

export function filterDealsByFollowUp<T extends { id: string }>(
  deals: T[],
  followUpsByDeal: ReadonlyMap<string, DealFollowUp>,
  filter: FollowUpFilter,
  now = new Date(),
) {
  return deals.filter((deal) => matchesFollowUpFilter(followUpsByDeal.get(deal.id), filter, now));
}

// The legacy import encoded date-only follow-ups as exactly 4:00 AM local.
// Hide only that known placeholder. A real early-morning appointment must stay visible.
function hasMeaningfulTime(dueAt: Date) {
  return dueAt.getHours() !== 4 || dueAt.getMinutes() !== 0;
}

export function formatFollowUpDue(followUp: DealFollowUp | null | undefined, now = new Date()) {
  if (!followUp) return 'Not scheduled';

  const dueAt = new Date(followUp.dueAt);
  if (Number.isNaN(dueAt.getTime())) return 'Not scheduled';

  const state = getFollowUpState(followUp, now);
  const withTime = hasMeaningfulTime(dueAt);
  const time = dueAt.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (state === 'today') return withTime ? `Today, ${time}` : 'Today';
  if (state === 'overdue') {
    const date = dueAt.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return withTime ? `Overdue · ${date}, ${time}` : `Overdue · ${date}`;
  }

  if (!withTime) return dueAt.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return dueAt.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function defaultFollowUpInputValue(now = new Date()) {
  const dueAt = new Date(now);
  dueAt.setDate(dueAt.getDate() + 1);
  dueAt.setHours(9, 0, 0, 0);

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${dueAt.getFullYear()}-${pad(dueAt.getMonth() + 1)}-${pad(dueAt.getDate())}T${pad(dueAt.getHours())}:${pad(dueAt.getMinutes())}`;
}
