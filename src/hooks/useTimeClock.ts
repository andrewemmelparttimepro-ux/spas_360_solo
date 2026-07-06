import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

export interface TimeEntry {
  id: string;
  job_id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  break_minutes: number | null;
  notes: string | null;
}

/** Start/stop time clock for a job, backed by the time_entries table. */
export function useTimeClock(jobId: string | undefined) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [isWorking, setIsWorking] = useState(false);

  const fetchEntries = useCallback(async () => {
    if (!jobId) return;
    const { data } = await supabase
      .from('time_entries')
      .select('*')
      .eq('job_id', jobId)
      .order('started_at', { ascending: false });
    setEntries(data ?? []);
  }, [jobId]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // My currently running entry on this job, if any
  const activeEntry = entries.find(e => e.user_id === user?.id && !e.ended_at) ?? null;

  const start = useCallback(async () => {
    if (!jobId || !user || activeEntry) return { error: activeEntry ? 'Already on the clock' : 'Not signed in' };
    setIsWorking(true);
    const { error } = await supabase.from('time_entries').insert({
      job_id: jobId,
      user_id: user.id,
      started_at: new Date().toISOString(),
    });
    setIsWorking(false);
    if (!error) await fetchEntries();
    return { error: error?.message ?? null };
  }, [jobId, user, activeEntry, fetchEntries]);

  const stop = useCallback(async (notes?: string) => {
    if (!activeEntry) return { error: 'Not on the clock' };
    setIsWorking(true);
    const { error } = await supabase
      .from('time_entries')
      .update({ ended_at: new Date().toISOString(), notes: notes || null })
      .eq('id', activeEntry.id);
    setIsWorking(false);
    if (!error) await fetchEntries();
    return { error: error?.message ?? null };
  }, [activeEntry, fetchEntries]);

  // Total minutes logged on this job across everyone (completed entries)
  const totalMinutes = entries.reduce((sum, e) => {
    if (!e.ended_at) return sum;
    const mins = (new Date(e.ended_at).getTime() - new Date(e.started_at).getTime()) / 60000;
    return sum + Math.max(0, mins - (e.break_minutes ?? 0));
  }, 0);

  return { entries, activeEntry, isWorking, start, stop, totalMinutes, refresh: fetchEntries };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
