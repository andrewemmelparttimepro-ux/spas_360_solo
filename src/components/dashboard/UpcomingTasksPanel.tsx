import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ALL_TASK_OWNERS,
  filterUpcomingTasks,
  taskOwnerName,
  type TaskOwnerFilter,
  type TaskOwnerOption,
  type UpcomingTaskItem,
} from '@/lib/upcomingTasks';

interface UpcomingTasksPanelProps {
  tasks: UpcomingTaskItem[];
  owners: TaskOwnerOption[];
}

export default function UpcomingTasksPanel({ tasks, owners }: UpcomingTasksPanelProps) {
  const [ownerFilter, setOwnerFilter] = useState<TaskOwnerFilter>(ALL_TASK_OWNERS);
  const filteredTasks = useMemo(
    () => filterUpcomingTasks(tasks, ownerFilter),
    [tasks, ownerFilter],
  );
  const selectedOwner = owners.find(owner => owner.id === ownerFilter);

  return (
    <div className="dashboard-panel bg-ink-900 rounded-xl border border-ink-700 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-ink-700 bg-ink-850/70">
        <h2 className="text-base font-semibold text-ink-100">Upcoming Tasks</h2>
        <select
          aria-label="Filter upcoming tasks by owner"
          value={ownerFilter}
          onChange={event => setOwnerFilter(event.target.value)}
          className="min-w-0 max-w-44 rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-xs font-medium text-ink-200 outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value={ALL_TASK_OWNERS}>All Tasks</option>
          {owners.map(owner => (
            <option key={owner.id} value={owner.id}>{taskOwnerName(owner)}</option>
          ))}
        </select>
      </div>
      <div className="max-h-[28rem] space-y-3 overflow-y-auto p-4">
        {filteredTasks.length === 0 ? (
          <p className="text-sm text-ink-500 text-center py-6">
            {selectedOwner
              ? `No upcoming tasks assigned to ${taskOwnerName(selectedOwner)}.`
              : 'No upcoming tasks.'}
          </p>
        ) : filteredTasks.map(task => (
          <Link
            key={task.id}
            to={task.link}
            className="flex items-start p-3 bg-ink-850/70 hover:bg-brand-500/10 rounded-lg transition-colors cursor-pointer border border-ink-700/70 hover:border-brand-500/30 group"
          >
            <div className="w-2 h-2 mt-2 rounded-full flex-shrink-0 bg-amber-500" />
            <div className="ml-3 min-w-0 flex-1">
              <p className="text-sm font-medium text-ink-100 group-hover:text-brand-500">{task.title}</p>
              <p className="text-xs text-ink-400 mt-0.5">{task.desc} · {task.assignedName}</p>
            </div>
            <span className="ml-2 shrink-0 text-xs font-medium text-ink-500">{task.time}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
