import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';
import { ChevronDown, ChevronLeft, ChevronRight, RefreshCw, Sparkles, Sunrise } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useMorningSummary } from '@/hooks/useMorningSummary';
import {
  centralDateKey,
  defaultSummaryDay,
  formatSummaryMinutes,
  shiftDateKey,
  staffAttentionFlags,
  summaryDayLabel,
  summaryHeadline,
  summaryMoney,
} from '@/lib/morningSummary';
import { cn } from '@/lib/utils';

const timeLabel = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '—';

type MorningSummaryContextValue = ReturnType<typeof useMorningSummary> & {
  day: string;
  setDay: Dispatch<SetStateAction<string>>;
  isOwner: boolean;
};

const MorningSummaryContext = createContext<MorningSummaryContextValue | null>(null);

function useDashboardMorningSummary(): MorningSummaryContextValue {
  const value = useContext(MorningSummaryContext);
  if (!value) throw new Error('Morning summary components must be inside MorningSummaryProvider');
  return value;
}

export function MorningSummaryProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [day, setDay] = useState(defaultSummaryDay);
  const isOwner = profile?.role === 'owner_manager';
  const summaryState = useMorningSummary(day, Boolean(isOwner));

  const value = useMemo(
    () => ({ ...summaryState, day, setDay, isOwner }),
    [summaryState, day, isOwner],
  );

  return <MorningSummaryContext.Provider value={value}>{children}</MorningSummaryContext.Provider>;
}

export default function MorningSummaryPanel() {
  const location = useLocation();
  const { day, setDay, isOwner, summary, isLoading, error, refresh } = useDashboardMorningSummary();
  const [narration, setNarration] = useState<{ day: string; text: string } | null>(null);
  const [narrating, setNarrating] = useState(false);
  const [narrationError, setNarrationError] = useState<string | null>(null);

  // Ari's three-sentence read, fetched once per day and cached server-side.
  useEffect(() => {
    if (!isOwner || !summary || narration?.day === summary.day) return;
    let cancelled = false;
    (async () => {
      setNarrating(true);
      setNarrationError(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Not signed in');
        const response = await fetch(`/api/owners/morning-narration?day=${summary.day}`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json().catch(() => null) as { narration?: string; error?: string } | null;
        if (!response.ok || !payload?.narration) throw new Error(payload?.error ?? 'Ari could not read the summary');
        if (!cancelled) setNarration({ day: summary.day, text: payload.narration });
      } catch (cause) {
        if (!cancelled) setNarrationError(cause instanceof Error ? cause.message : 'Ari could not read the summary');
      } finally {
        if (!cancelled) setNarrating(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isOwner, summary, narration?.day]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('summary') === 'open') {
      document.getElementById('morning-summary-heading')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.search]);

  const today = centralDateKey();
  const canGoForward = day < today;
  const headline = useMemo(() => summary ? summaryHeadline(summary) : '', [summary]);

  if (!isOwner) return null;

  return (
    <section className="dashboard-panel overflow-hidden rounded-xl border border-amber-500/30 bg-ink-900" aria-labelledby="morning-summary-heading">
      <div className="flex flex-col gap-3 border-b border-ink-700 bg-amber-500/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-500"><Sunrise className="h-5 w-5" /></span>
          <span className="min-w-0">
            <h2 id="morning-summary-heading" className="text-base font-semibold text-ink-100">Morning Summary</h2>
            <span className="block text-xs text-ink-500">
              {summaryDayLabel(day)}{day === today ? ' (today so far)' : ''}
              {headline ? ` · ${headline}` : isLoading ? ' · Loading…' : ''}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-1 self-start sm:self-auto">
          <button type="button" aria-label="Previous day" onClick={() => setDay(current => shiftDateKey(current, -1))} className="rounded-lg border border-ink-700 p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100"><ChevronLeft className="h-4 w-4" /></button>
          <input aria-label="Summary day" type="date" value={day} max={today} onChange={event => { if (event.target.value) setDay(event.target.value); }} className="rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-xs font-medium text-ink-200" />
          <button type="button" aria-label="Next day" disabled={!canGoForward} onClick={() => setDay(current => shiftDateKey(current, 1))} className="rounded-lg border border-ink-700 p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" aria-label="Refresh summary" onClick={() => void refresh()} className="rounded-lg border border-ink-700 p-2 text-ink-400 hover:bg-ink-800 hover:text-ink-100"><RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} /></button>
        </div>
      </div>
      <div className="space-y-3 p-5">
        {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">Summary couldn't load. ({error})</p>}
        {!summary && isLoading && <p className="text-sm text-ink-500">Pulling yesterday together…</p>}
        {summary && (
          <div className="flex items-start gap-3 rounded-lg border border-brand-500/25 bg-brand-500/5 px-4 py-3" aria-label="Ari's read">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" />
            <div className="min-w-0 text-sm text-ink-200">
              <span className="mr-1 text-[10px] font-bold uppercase tracking-wider text-brand-400">Ari's read</span>
              {narration?.day === summary.day ? narration.text : narrating ? 'Reading the day…' : narrationError ? `Ari couldn't read this one (${narrationError}).` : ''}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function EveryonesDayPanel() {
  const location = useLocation();
  const { day, isOwner, summary, isLoading, error } = useDashboardMorningSummary();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('summary') === 'open') setOpen(true);
  }, [location.search]);

  if (!isOwner) return null;

  return (
    <section className="dashboard-panel overflow-hidden rounded-xl border border-ink-700 bg-ink-900" aria-labelledby="everyones-day-heading">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left hover:bg-ink-850/70"
        aria-expanded={open}
        aria-controls="everyones-day-body"
      >
        <span className="flex min-w-0 items-center gap-3">
          <Sunrise className="h-5 w-5 shrink-0 text-amber-500" />
          <span id="everyones-day-heading" className="shrink-0 text-base font-semibold text-ink-100">Everyone's Day</span>
          <span className="truncate text-xs text-ink-500">{summaryDayLabel(day)}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-ink-500 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div id="everyones-day-body" className="space-y-5 border-t border-ink-700 p-5">
          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">Summary couldn't load. ({error})</p>}
          {!summary && isLoading && <p className="text-sm text-ink-500">Pulling yesterday together…</p>}
          {summary && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Clocked in', value: summary.activity.clocked_in_count },
                  { label: 'Tasks completed', value: summary.delegated.completed },
                  { label: 'Tasks still open', value: summary.delegated.open, warn: summary.delegated.overdue > 0 ? `${summary.delegated.overdue} overdue` : null },
                  { label: 'Deals won', value: summary.deals.won.length, sub: summaryMoney(summary.deals.won.reduce((total, deal) => total + (deal.amount ?? 0), 0)) },
                ].map(stat => (
                  <div key={stat.label} className="rounded-lg border border-ink-700 bg-ink-850/70 px-3 py-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-ink-500">{stat.label}</p>
                    <p className="mt-1 text-xl font-bold text-ink-100">{stat.value}</p>
                    {'sub' in stat && stat.sub && <p className="text-xs text-ink-500">{stat.sub}</p>}
                    {'warn' in stat && stat.warn && <p className="text-xs font-semibold text-red-400">{stat.warn}</p>}
                  </div>
                ))}
              </div>

              <section aria-label="Staff activity">
                <div className="overflow-x-auto rounded-lg border border-ink-700">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-ink-850 text-[10px] font-bold uppercase tracking-wider text-ink-500">
                      <tr>
                        <th className="px-3 py-2">Teammate</th>
                        <th className="px-3 py-2">Clock</th>
                        <th className="px-3 py-2">Hours</th>
                        <th className="px-3 py-2">Tasks done</th>
                        <th className="px-3 py-2">Still open</th>
                        <th className="px-3 py-2">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.staff.map(person => {
                        const flags = staffAttentionFlags(person);
                        return (
                          <tr key={person.id} className="border-t border-ink-800 align-top">
                            <td className="px-3 py-2 font-semibold text-ink-100">{person.name}<span className="block text-[11px] font-normal text-ink-500">{person.delegated_sent > 0 ? `Sent ${person.delegated_sent}` : ''}</span></td>
                            <td className="px-3 py-2 text-xs text-ink-300">
                              {person.punches.length === 0 ? <span className="text-ink-500">No punch</span> : person.punches.map((punch, index) => (
                                <span key={index} className="block">{timeLabel(punch.clock_in)} – {timeLabel(punch.clock_out)}{punch.reason === 'lunch' ? ' (lunch)' : ''}</span>
                              ))}
                            </td>
                            <td className="px-3 py-2 text-ink-200">{person.minutes_total > 0 ? formatSummaryMinutes(person.minutes_total) : '—'}</td>
                            <td className="px-3 py-2 text-xs text-ink-300">
                              {person.delegated_completed.length === 0 ? <span className="text-ink-500">—</span> : person.delegated_completed.map((task, index) => <span key={index} className="block">✓ {task.title}</span>)}
                            </td>
                            <td className="px-3 py-2 text-xs text-ink-300">
                              {person.delegated_open.length === 0 ? <span className="text-ink-500">—</span> : person.delegated_open.map((task, index) => (
                                <span key={index} className={cn('block', task.overdue && 'font-semibold text-red-400')}>{task.title}</span>
                              ))}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {flags.length === 0 ? <span className="text-emerald-400">Clear</span> : flags.map(flag => <span key={flag} className="block font-semibold text-amber-400">{flag}</span>)}
                              {person.punches.filter(punch => punch.acknowledged_titles.length > 0).map((punch, index) => (
                                <span key={`ack-${index}`} className="block text-ink-500">Left open: {punch.acknowledged_titles.join(', ')}</span>
                              ))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <div className="grid gap-4 lg:grid-cols-3">
                <section aria-label="Deals" className="rounded-lg border border-ink-700 p-3">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-brand-400">Deals</h3>
                  <ul className="space-y-1 text-sm text-ink-300">
                    {summary.deals.won.map((deal, index) => <li key={`won-${index}`}><span className="font-semibold text-emerald-400">Won</span> {deal.title} · {summaryMoney(deal.amount)}{deal.owner ? ` · ${deal.owner}` : ''}</li>)}
                    {summary.deals.lost.map((deal, index) => <li key={`lost-${index}`}><span className="font-semibold text-red-400">Lost</span> {deal.title}{deal.reason ? ` · ${deal.reason}` : ''}</li>)}
                    {summary.deals.created.map((deal, index) => <li key={`new-${index}`}><span className="font-semibold text-ink-200">New</span> {deal.title}{deal.owner ? ` · ${deal.owner}` : ''}</li>)}
                    <li className="text-xs text-ink-500">{summary.deals.stage_changes} stage move{summary.deals.stage_changes === 1 ? '' : 's'}</li>
                  </ul>
                </section>
                <section aria-label="Service" className="rounded-lg border border-ink-700 p-3">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-emerald-400">Service</h3>
                  <ul className="space-y-1 text-sm text-ink-300">
                    {summary.jobs.completed.map((job, index) => <li key={`done-${index}`}><span className="font-semibold text-emerald-400">Done</span> {job.title} · {job.job_type}</li>)}
                    {summary.jobs.completed.length === 0 && <li className="text-xs text-ink-500">No jobs completed.</li>}
                    <li className="pt-1 text-xs font-bold uppercase tracking-wider text-ink-500">On the board today</li>
                    {summary.jobs.scheduled_today.length === 0 && <li className="text-xs text-ink-500">Nothing scheduled.</li>}
                    {summary.jobs.scheduled_today.map((job, index) => <li key={`today-${index}`}>{job.all_day ? 'All day' : timeLabel(job.scheduled_at)} · {job.title} · {job.job_type}</li>)}
                  </ul>
                </section>
                <section aria-label="Activity" className="rounded-lg border border-ink-700 p-3">
                  <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-violet-400">Activity</h3>
                  <ul className="space-y-1 text-sm text-ink-300">
                    <li>{summary.activity.new_customers} new customer{summary.activity.new_customers === 1 ? '' : 's'}</li>
                    <li>{summary.activity.inbound_texts} inbound text{summary.activity.inbound_texts === 1 ? '' : 's'}</li>
                    <li>{summary.delegated.created} task{summary.delegated.created === 1 ? '' : 's'} delegated</li>
                    <li>{summary.jobs.created} job{summary.jobs.created === 1 ? '' : 's'} created</li>
                    <li>{summary.activity.suggestions} suggestion{summary.activity.suggestions === 1 ? '' : 's'} · {summary.activity.fix_it_posts} Fix-It post{summary.activity.fix_it_posts === 1 ? '' : 's'}</li>
                  </ul>
                </section>
              </div>
              <p className="text-[11px] text-ink-500">Covers {summaryDayLabel(summary.day)} in Minot time. Generated {new Date(summary.generated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
