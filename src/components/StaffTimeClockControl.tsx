import { useEffect, useMemo, useState } from 'react';
import { Clock3, Coffee, LogIn, LogOut, X } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { useStaffTimeClock } from '@/hooks/useStaffTimeClock';
import { formatClockMinutes, localDayKey, timeEntriesMinutes } from '@/lib/staffTimeClock';

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
  const todayMinutes = useMemo(() => timeEntriesMinutes(entries), [entries]);

  useEffect(() => {
    if (!profile || isLoading || entries.length > 0 || activeEntry) return;
    if (markPromptShown(profile.id)) setOpen(true);
  }, [profile, isLoading, entries.length, activeEntry]);

  const handleClockIn = async () => {
    const result = await clockIn();
    toast(result.message, result.ok ? 'success' : 'error');
  };

  const handleClockOut = async (reason: 'lunch' | 'end_day') => {
    const result = await clockOut(reason);
    toast(result.message, result.ok ? 'success' : 'error');
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-700 px-2 py-1.5 text-xs font-semibold text-ink-300 transition-colors hover:bg-ink-800 hover:text-ink-100"
        aria-label="Clock In/Out"
      >
        <Clock3 className="h-4 w-4" />
        <span>Clock In/Out</span>
        <span className={`h-2 w-2 rounded-full ${activeEntry ? 'bg-emerald-400' : 'bg-ink-600'}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <section role="dialog" aria-modal="true" aria-labelledby="staff-clock-title" className="w-full max-w-md overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl">
            <header className="flex items-start justify-between border-b border-ink-700 bg-ink-850 px-5 py-4">
              <div>
                <h2 id="staff-clock-title" className="flex items-center gap-2 text-lg font-bold text-ink-100"><Clock3 className="h-5 w-5 text-brand-400" /> Staff Time Clock</h2>
                <p className="mt-1 text-xs text-ink-500">{activeEntry ? `Clocked in at ${new Date(activeEntry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'You are currently clocked out.'}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Dismiss time clock" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-800 hover:text-ink-200"><X className="h-5 w-5" /></button>
            </header>

            <div className="space-y-4 p-5">
              {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
              {activeEntry ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" disabled={isSaving} onClick={() => void handleClockOut('lunch')} className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-bold text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
                    <Coffee className="h-4 w-4" /> Clock Out for Lunch
                  </button>
                  <button type="button" disabled={isSaving} onClick={() => void handleClockOut('end_day')} className="flex items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 py-3 text-sm font-bold text-white hover:bg-brand-600 disabled:opacity-50">
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
                      <span className="text-ink-200">{new Date(entry.clock_in).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – {entry.clock_out ? new Date(entry.clock_out).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'Now'}</span>
                      <span className="text-xs text-ink-500">{entry.clock_out_reason === 'lunch' ? 'Lunch' : entry.clock_out_reason === 'end_day' ? 'End day' : entry.clock_out ? 'Adjusted' : 'Active'}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
