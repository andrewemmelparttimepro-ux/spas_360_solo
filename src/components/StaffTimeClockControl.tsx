import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock3, Coffee, LifeBuoy, LogIn, LogOut, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffTimeClock } from '@/hooks/useStaffTimeClock';
import { fetchMyIncompleteDelegatedTasks, type DelegatedPerson } from '@/hooks/useDelegatedTasks';
import { DELEGATED_TASK_TYPE, formatDelegatedDue, parseDelegatedRequest } from '@/lib/delegatedTasks';
import { formatClockMinutes, localDayKey, timeEntriesMinutes } from '@/lib/staffTimeClock';
import { supabase } from '@/lib/supabase';
import { THRAWN_PROFILE_ID } from '@/lib/upcomingTasks';

type ClockOutReason = 'lunch' | 'end_day';
type PendingTask = { id: string; title: string; due_at: string | null };

function markPromptShown(userId: string): boolean {
  const key = `spas360:staff-clock-prompt:${userId}:${localDayKey()}`;
  try {
    if (window.localStorage.getItem(key)) return false;
    window.localStorage.setItem(key, 'shown');
  } catch {
    // Storage may be unavailable; showing the prompt is the safe fallback.
  }
  return true;
}

export default function StaffTimeClockControl() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const { entries, activeEntry, isLoading, isSaving, error, clockIn, clockOut } = useStaffTimeClock();
  const [open, setOpen] = useState(false);
  const [pendingReason, setPendingReason] = useState<ClockOutReason | null>(null);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const [checkingTasks, setCheckingTasks] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [owners, setOwners] = useState<DelegatedPerson[]>([]);
  const [fixOwner, setFixOwner] = useState('');
  const [fixNote, setFixNote] = useState('');
  const [fixSending, setFixSending] = useState(false);
  const todayMinutes = useMemo(() => timeEntriesMinutes(entries), [entries]);

  useEffect(() => {
    if (!profile || isLoading || entries.length > 0 || activeEntry) return;
    if (markPromptShown(profile.id)) setOpen(true);
  }, [profile, isLoading, entries.length, activeEntry]);

  useEffect(() => {
    if (!fixOpen || !profile) return;
    void supabase
      .from('profiles')
      .select('id, first_name, last_name, role')
      .eq('org_id', profile.org_id)
      .eq('role', 'owner_manager')
      .neq('id', THRAWN_PROFILE_ID)
      .neq('id', profile.id)
      .order('first_name')
      .then(({ data }) => {
        const list = (data ?? []) as DelegatedPerson[];
        setOwners(list);
        setFixOwner(current => current || list[0]?.id || '');
      });
  }, [fixOpen, profile]);

  const handleClockIn = async () => {
    const result = await clockIn();
    toast(result.message, result.ok ? 'success' : 'error');
  };

  // Brandon's rule: nobody clocks out past an incomplete delegated task without
  // acknowledging each one by name. The database enforces the same gate.
  const beginClockOut = async (reason: ClockOutReason) => {
    if (!profile) return;
    setCheckingTasks(true);
    try {
      const tasks = await fetchMyIncompleteDelegatedTasks(profile.id);
      if (tasks.length === 0) {
        const result = await clockOut(reason);
        toast(result.message, result.ok ? 'success' : 'error');
        return;
      }
      setPendingTasks(tasks);
      setAcknowledged({});
      setPendingReason(reason);
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : 'Could not check your delegated tasks.', 'error');
    } finally {
      setCheckingTasks(false);
    }
  };

  const allAcknowledged = pendingTasks.length > 0 && pendingTasks.every(task => acknowledged[task.id]);

  const confirmClockOut = async () => {
    if (!pendingReason || !allAcknowledged) return;
    const result = await clockOut(pendingReason, pendingTasks.map(task => task.id));
    toast(result.message, result.ok ? 'success' : 'error');
    if (result.ok) { setPendingReason(null); setPendingTasks([]); }
  };

  const sendFixRequest = async () => {
    if (!profile || !fixOwner || fixSending) return;
    const parsed = parseDelegatedRequest(`Time card correction for ${profile.first_name} ${profile.last_name}\n${fixNote.trim()}`);
    if (!parsed || !fixNote.trim()) { toast('Tell the owner what to correct (day and times).', 'warning'); return; }
    setFixSending(true);
    const { error: insertError } = await supabase.from('tasks').insert({
      org_id: profile.org_id,
      assigned_to: fixOwner,
      title: parsed.title,
      description: parsed.description,
      due_at: null,
      priority: 'Medium',
      status: 'Pending',
      task_type: DELEGATED_TASK_TYPE,
      created_by: profile.id,
    });
    setFixSending(false);
    if (insertError) { toast(insertError.message, 'error'); return; }
    toast('Correction request sent to the owner as a delegated task.', 'success');
    setFixNote('');
    setFixOpen(false);
  };

  const timeLabel = (value: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Now';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-700 px-2 py-1.5 text-xs font-semibold text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100"
        aria-label="Clock In/Out"
        title={activeEntry ? 'Clocked in — open the time clock' : 'Clock In/Out'}
      >
        <Clock3 className="h-4 w-4" />
        <span className="hidden sm:inline">Clock In/Out</span>
        <span className={`h-2 w-2 rounded-full ${activeEntry ? 'bg-emerald-400' : 'bg-ink-600'}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="staff-clock-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
            <header className="flex items-start justify-between border-b border-ink-700 bg-ink-850 px-5 py-4">
              <div>
                <h2 id="staff-clock-title" className="flex items-center gap-2 text-lg font-bold text-ink-100"><Clock3 className="h-5 w-5 text-brand-400" /> Staff Time Clock</h2>
                <p className="mt-1 text-xs text-ink-500">{activeEntry ? `Clocked in at ${timeLabel(activeEntry.clock_in)}` : 'You are currently clocked out.'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss time clock" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"><X className="h-5 w-5" /></button>
            </header>

            <div className="space-y-4 p-5">
              {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
              {activeEntry ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" disabled={isSaving || checkingTasks} onClick={() => void beginClockOut('lunch')} className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
                    <Coffee className="h-4 w-4" /> Clock Out for Lunch
                  </button>
                  <button type="button" disabled={isSaving || checkingTasks} onClick={() => void beginClockOut('end_day')} className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
                    <LogOut className="h-4 w-4" /> Clock Out for Day
                  </button>
                </div>
              ) : (
                <button type="button" disabled={isSaving || isLoading} onClick={() => void handleClockIn()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
                  <LogIn className="h-4 w-4" /> {entries.length > 0 ? 'Clock Back In' : 'Clock In'}
                </button>
              )}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink-400">Today</h3>
                  <span className="text-xs font-semibold text-ink-300">{formatClockMinutes(todayMinutes)}</span>
                </div>
                <div className="max-h-48 space-y-2 overflow-y-auto">
                  {entries.length === 0 ? <p className="rounded-lg border border-dashed border-ink-700 py-4 text-center text-sm text-ink-500">No time recorded today.</p> : entries.map(entry => (
                    <div key={entry.id} className="flex items-center justify-between rounded-lg border border-ink-700 bg-ink-850 px-3 py-2 text-sm">
                      <span className="text-ink-200">{timeLabel(entry.clock_in)} – {timeLabel(entry.clock_out)}</span>
                      <span className="text-xs text-ink-500">
                        {entry.clock_out_reason === 'lunch' ? 'Lunch' : entry.clock_out_reason === 'end_day' ? 'End day' : entry.clock_out ? 'Adjusted' : 'Active'}
                        {entry.acknowledged_incomplete_count > 0 ? ` · ${entry.acknowledged_incomplete_count} open task${entry.acknowledged_incomplete_count === 1 ? '' : 's'}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Only an owner can edit a punch. Forgot to clock in? Ask, don't guess. */}
              <div className="rounded-xl border border-ink-700 bg-ink-850/60 p-3">
                <button type="button" onClick={() => setFixOpen(value => !value)} className="flex w-full items-center gap-2 text-left text-xs font-semibold text-ink-300 hover:text-ink-100">
                  <LifeBuoy className="h-4 w-4 text-brand-400" /> Forgot to clock in or out? Ask an owner to correct it
                </button>
                {fixOpen && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs text-ink-500">Only an owner can edit time cards. This sends them a delegated task with your note.</p>
                    <select aria-label="Owner to ask" value={fixOwner} onChange={event => setFixOwner(event.target.value)} className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100">
                      {owners.length === 0 && <option value="">No owner available</option>}
                      {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.first_name} {owner.last_name}</option>)}
                    </select>
                    <textarea aria-label="What should be corrected" rows={2} value={fixNote} onChange={event => setFixNote(event.target.value)} placeholder="Example: I arrived at 8:00 AM today but clocked in at 8:40. Please fix my clock-in." className="w-full rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-600" />
                    <button type="button" disabled={fixSending || !fixOwner} onClick={() => void sendFixRequest()} className="rounded-lg bg-brand-500 px-3 py-2 text-xs font-bold text-white hover:bg-brand-600 disabled:opacity-50">Send correction request</button>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}

      {pendingReason && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="clock-out-ack-title" className="w-full max-w-lg overflow-hidden rounded-2xl border border-amber-500/40 bg-ink-900 shadow-2xl">
            <header className="border-b border-ink-700 bg-amber-500/10 px-5 py-4">
              <h2 id="clock-out-ack-title" className="flex items-center gap-2 text-lg font-bold text-ink-100"><AlertTriangle className="h-5 w-5 text-amber-400" /> You still have incomplete delegated tasks</h2>
              <p className="mt-1 text-xs text-ink-400">Check each task to acknowledge you are clocking out {pendingReason === 'lunch' ? 'for lunch' : 'for the day'} with it unfinished. The owner will be notified.</p>
            </header>
            <div className="max-h-72 space-y-2 overflow-y-auto p-5">
              {pendingTasks.map(task => (
                <label key={task.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-ink-700 bg-ink-850 px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Acknowledge ${task.title} is incomplete`}
                    checked={Boolean(acknowledged[task.id])}
                    onChange={event => setAcknowledged(current => ({ ...current, [task.id]: event.target.checked }))}
                    className="mt-1 h-5 w-5 rounded border-ink-600 text-amber-500 focus:ring-amber-500"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink-100">{task.title}</span>
                    <span className="block text-xs text-ink-500">{formatDelegatedDue(task.due_at)}</span>
                  </span>
                </label>
              ))}
            </div>
            <footer className="flex flex-col gap-2 border-t border-ink-700 px-5 py-4 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => { setPendingReason(null); setPendingTasks([]); }} className="rounded-lg border border-ink-600 px-4 py-2 text-sm font-semibold text-ink-200 hover:bg-ink-800">Go finish them first</button>
              <button type="button" disabled={!allAcknowledged || isSaving} onClick={() => void confirmClockOut()} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">
                I acknowledge — clock out anyway
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
