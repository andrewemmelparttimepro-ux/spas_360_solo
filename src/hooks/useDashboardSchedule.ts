import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { debounceRefetch } from '@/lib/realtime';
import { countScheduledJobs, dealershipDate, loadSchedulePages, scheduleDayBounds, type ScheduleCountJob, type ScheduleCounts } from '@/lib/dashboardSchedule';

export function useDashboardSchedule() {
  const { profile } = useAuth();
  const orgId = profile?.org_id;
  const [date, setDate] = useState(() => dealershipDate());
  const [result, setResult] = useState<{ key: string; counts: ScheduleCounts } | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0);
  const key = `${orgId}:${date}`;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const checkDate = () => {
      clearTimeout(timer);
      const now = new Date();
      const today = dealershipDate(now);
      setDate(today);
      timer = setTimeout(checkDate, Math.max(100, new Date(scheduleDayBounds(today).end).getTime() - now.getTime() + 50));
    };
    checkDate();
    window.addEventListener('focus', checkDate);
    document.addEventListener('visibilitychange', checkDate);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', checkDate);
      document.removeEventListener('visibilitychange', checkDate);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!orgId) return;
    const request = ++sequence.current;
    setIsFetching(true);
    setError(null);
    try {
      const bounds = scheduleDayBounds(date);
      const rows = await loadSchedulePages<ScheduleCountJob>((offset, size) => supabase
        .from('jobs')
        .select('id, job_type, status, scheduled_at, scheduled_end_date')
        .eq('org_id', orgId)
        .neq('status', 'Cancelled')
        .lt('scheduled_at', bounds.end)
        .or(`scheduled_at.gte.${bounds.start},scheduled_end_date.gte.${date}`)
        .order('id', { ascending: true })
        .range(offset, offset + size - 1));
      if (request !== sequence.current) return;
      setResult({ key, counts: countScheduledJobs(rows, date) });
    } catch (cause) {
      if (request !== sequence.current) return;
      setError(cause instanceof Error ? cause.message : 'Scheduled jobs could not load.');
    } finally {
      if (request === sequence.current) setIsFetching(false);
    }
  }, [orgId, date, key]);

  useEffect(() => {
    void refresh();
    return () => { sequence.current += 1; };
  }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    const refetch = debounceRefetch(refresh);
    const channel = supabase.channel(`dashboard-schedule-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs', filter: `org_id=eq.${orgId}` }, refetch)
      .subscribe();
    window.addEventListener('focus', refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      refetch.cancel();
      void supabase.removeChannel(channel);
    };
  }, [orgId, refresh]);

  return { date, counts: result?.key === key ? result.counts : null, isLoading: isFetching || (!error && result?.key !== key), error, refresh };
}
