import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDashboardSchedule } from '@/hooks/useDashboardSchedule';
import { dashboardScheduleLink, scheduleCalendarDate, TODAY_JOB_TYPES } from '@/lib/dashboardSchedule';
import { jobTypeDotColors } from '@/hooks/useServiceJobs';

export default function TodayScheduleTiles() {
  const { date, counts, isLoading, error, refresh } = useDashboardSchedule();
  const dateLabel = scheduleCalendarDate(date)!.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  return (
    <section aria-labelledby="today-schedule-heading" aria-busy={isLoading}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="today-schedule-heading" className="text-sm font-semibold text-ink-100">Scheduled today</h2>
        <p className="text-xs text-ink-400">All stores · {dateLabel} · Central time</p>
      </div>
      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
          Scheduled jobs couldn't load.
          <button type="button" onClick={() => void refresh()} className="ml-3 rounded-lg border border-red-500/40 px-3 py-1.5 font-semibold focus-visible:ring-2 focus-visible:ring-brand-500">Retry</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {TODAY_JOB_TYPES.map(type => {
            const label = type === 'Customer Pick Up' ? 'Customer Pickup' : type;
            const content = <>
              <p className="flex items-center gap-2 text-xs font-semibold text-ink-400"><span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${jobTypeDotColors[type]}`} />{label}</p>
              <p className="mt-2 text-2xl font-bold text-ink-100">{isLoading || !counts ? <span className="text-sm font-medium text-ink-400">Loading…</span> : counts[type]}</p>
            </>;
            const classes = 'relative rounded-xl border border-ink-700 bg-ink-900 p-4';
            return isLoading || !counts ? <div key={type} className={classes}>{content}</div> : (
              <Link key={type} to={dashboardScheduleLink({ date, types: [type], view: 'day' })}
                aria-label={`${counts[type]} ${label} jobs scheduled today, ${dateLabel}, all stores`}
                className={`${classes} group hover:border-brand-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500`}>
                {content}
                <ArrowUpRight aria-hidden="true" className="absolute right-3 top-3 h-3.5 w-3.5 text-ink-500 group-hover:text-brand-400" />
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
