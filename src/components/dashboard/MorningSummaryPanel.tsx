import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Sparkles, Sunrise } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMorningSummary } from '@/hooks/useMorningSummary';
import {
  centralDateKey,
  defaultDailySummaryDay,
  personalPerformanceRead,
  shiftDateKey,
  summaryDayLabel,
  summaryHeadline,
  type SummaryStaff,
} from '@/lib/morningSummary';
import { cn } from '@/lib/utils';

type MorningSummaryContextValue = ReturnType<typeof useMorningSummary> & {
  day: string;
  setDay: Dispatch<SetStateAction<string>>;
};

const MorningSummaryContext = createContext<MorningSummaryContextValue | null>(null);

function useDashboardMorningSummary(): MorningSummaryContextValue {
  const value = useContext(MorningSummaryContext);
  if (!value) throw new Error('Morning summary components must be inside MorningSummaryProvider');
  return value;
}

export function MorningSummaryProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [day, setDay] = useState(defaultDailySummaryDay);
  const summaryState = useMorningSummary(day, Boolean(profile));
  const value = useMemo(() => ({ ...summaryState, day, setDay }), [summaryState, day]);
  return <MorningSummaryContext.Provider value={value}>{children}</MorningSummaryContext.Provider>;
}

const metricCards = (person: SummaryStaff) => [
  { label: 'Leads followed up', value: person.leads_followed_up },
  { label: 'Tasks set', value: person.tasks_set },
  { label: 'New deals', value: person.deals_created },
  { label: 'Deals won', value: person.deals_won, tone: person.deals_won > 0 ? 'text-emerald-400' : undefined },
  { label: 'Deals lost', value: person.deals_lost, tone: person.deals_lost > 0 ? 'text-red-400' : undefined },
];

function PersonSummary({ person, own }: { person: SummaryStaff; own: boolean }) {
  return (
    <section aria-label={`${person.name} daily summary`} className="rounded-lg border border-ink-700 bg-ink-850/60 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-ink-100">{own ? 'Your individual summary' : person.name}</h3>
        {!own && <span className="text-[10px] font-bold uppercase tracking-wider text-ink-500">{person.role.replace('_', ' ')}</span>}
      </div>
      <div className="mt-3 flex items-start gap-2 rounded-lg border border-brand-500/25 bg-brand-500/5 px-3 py-2.5">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
        <p className="text-sm text-ink-200"><span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">Daily read</span>{personalPerformanceRead(person)}</p>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {metricCards(person).map(metric => (
          <div key={metric.label} className="rounded-lg border border-ink-700 bg-ink-900 px-3 py-2">
            <p className="text-[9px] font-bold uppercase tracking-wider text-ink-500">{metric.label}</p>
            <p className={cn('mt-1 text-lg font-bold text-ink-100', metric.tone)}>{metric.value}</p>
          </div>
        ))}
      </div>
      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Must-dos for this day</p>
        {person.must_dos.length === 0 ? (
          <p className="mt-1 text-xs text-ink-500">Nothing due or carried over.</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm text-ink-300">
            {person.must_dos.map((task, index) => (
              <li key={`${task.title}-${index}`} className={cn(task.overdue && 'font-semibold text-red-400')}>
                {task.overdue ? 'Overdue · ' : ''}{task.title}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function MorningSummaryPanel() {
  const location = useLocation();
  const { profile } = useAuth();
  const { day, setDay, summary, isLoading, error, refresh } = useDashboardMorningSummary();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('summary') === 'open') {
      setOpen(true);
      document.getElementById('morning-summary-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.search]);

  const today = centralDateKey();
  const canGoForward = day < today;
  const ownSummary = summary?.staff.find(person => person.id === profile?.id) ?? null;
  const collapsedRead = ownSummary ? personalPerformanceRead(ownSummary) : summary?.owner_view ? summaryHeadline(summary) : '';

  if (!profile) return null;

  return (
    <section className="dashboard-panel overflow-hidden rounded-xl border border-amber-500/30 bg-ink-900" aria-labelledby="morning-summary-heading">
      <div className="flex flex-col gap-3 bg-amber-500/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen(value => !value)}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
          aria-expanded={open}
          aria-controls="morning-summary-body"
        >
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500"><Sunrise className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <h2 id="morning-summary-heading" className="text-base font-semibold text-ink-100">Daily Summary</h2>
              <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-500 transition-transform', open && 'rotate-180')} />
            </span>
            <span className="block truncate text-xs text-ink-500">
              {summaryDayLabel(day)} · based on {summaryDayLabel(shiftDateKey(day, -1))}
              {collapsedRead ? ` · ${collapsedRead}` : isLoading ? ' · Loading…' : ''}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1 self-start sm:self-auto">
          <button type="button" aria-label="Previous day" onClick={() => setDay(current => shiftDateKey(current, -1))} className="rounded-lg border border-ink-700 p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100"><ChevronLeft className="h-4 w-4" /></button>
          <input aria-label="Summary day" type="date" value={day} max={today} onChange={event => { if (event.target.value) setDay(event.target.value); }} className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-xs font-medium text-ink-200" />
          <button type="button" aria-label="Next day" disabled={!canGoForward} onClick={() => setDay(current => shiftDateKey(current, 1))} className="rounded-lg border border-ink-700 p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" aria-label="Refresh summary" onClick={() => void refresh()} className="rounded-lg border border-ink-700 p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100"><RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} /></button>
        </div>
      </div>

      {open && (
        <div id="morning-summary-body" className="space-y-4 border-t border-ink-700 p-5">
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">Summary couldn't load. ({error})</p>}
          {!summary && isLoading && <p className="text-sm text-ink-500">Pulling the day together…</p>}
          {summary?.owner_view && (
            <section aria-label="Staff-wide totals">
              <h3 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-500">Staff-wide totals</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  { label: 'Leads followed up', value: summary.staff.reduce((total, person) => total + person.leads_followed_up, 0) },
                  { label: 'Tasks set', value: summary.staff.reduce((total, person) => total + person.tasks_set, 0) },
                  { label: 'New deals', value: summary.deals.created.length },
                  { label: 'Deals won', value: summary.deals.won.length },
                  { label: 'Deals lost', value: summary.deals.lost.length },
                ].map(metric => (
                  <div key={metric.label} className="rounded-lg border border-ink-700 bg-ink-850/70 px-3 py-2.5">
                    <p className="text-[9px] font-bold uppercase tracking-wider text-ink-500">{metric.label}</p>
                    <p className="mt-1 text-xl font-bold text-ink-100">{metric.value}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
          {ownSummary && <PersonSummary person={ownSummary} own />}
          {summary?.owner_view && summary.staff.filter(person => person.id !== profile.id).length > 0 && (
            <section aria-label="Team individual summaries" className="space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-ink-500">Team individual summaries</h3>
              {summary.staff.filter(person => person.id !== profile.id).map(person => <PersonSummary key={person.id} person={person} own={false} />)}
            </section>
          )}
          {summary && <p className="text-[11px] text-ink-500">Performance covers {summaryDayLabel(summary.day)} in Minot time. Must-dos are reconstructed for {summaryDayLabel(day)} from recorded task dates and completion times.</p>}
        </div>
      )}
    </section>
  );
}
