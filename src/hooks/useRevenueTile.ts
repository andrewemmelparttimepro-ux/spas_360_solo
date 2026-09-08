import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { debounceRefetch } from '@/lib/realtime';
import { defaultRevenueTileFilters, loadRevenueTileReport, revenueTileMonthComparison, revenueTileRange, revenueTileRpcParams, type RevenueTileFilters, type RevenueTileReport } from '@/lib/dashboardRevenueTile';

export function useRevenueTile(filters: RevenueTileFilters, comparePreviousYear = false) {
  const { profile } = useAuth();
  const orgId = profile?.org_id;
  const [now, setNow] = useState(() => new Date());
  const range = revenueTileRange(filters, now);
  const start = range?.start.toISOString();
  const end = range?.end.toISOString();
  const comparison = comparePreviousYear && filters.period === 'month' && range ? revenueTileMonthComparison(range) : null;
  const previousStart = comparison?.previousYearRange.start.toISOString();
  const previousEnd = comparison?.previousYearRange.end.toISOString();
  const key = JSON.stringify([orgId, start, end, filters.assignedTo, filters.locationId, previousStart, previousEnd]);
  const [result, setResult] = useState<{ key: string; orgId: string; report: RevenueTileReport } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [isFetching, setIsFetching] = useState(true);
  const sequence = useRef(0);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const checkMonth = () => {
      clearTimeout(timer);
      const current = new Date();
      setNow(current);
      const monthEnd = revenueTileRange(defaultRevenueTileFilters(current), current)!.end.getTime() + 1;
      // Refresh at Central midnight on month end; focus/visibility also catch
      // up after the browser suspends a background timer.
      timer = setTimeout(checkMonth, Math.min(60 * 60 * 1000, Math.max(100, monthEnd - current.getTime() + 50)));
    };
    checkMonth();
    window.addEventListener('focus', checkMonth);
    document.addEventListener('visibilitychange', checkMonth);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', checkMonth);
      document.removeEventListener('visibilitychange', checkMonth);
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!orgId || !start || !end) return;
    const request = ++sequence.current;
    setIsFetching(true);
    setFailure(null);
    try {
      const report = await loadRevenueTileReport(
        revenueTileRpcParams({ start: new Date(start), end: new Date(end) }, filters),
        params => supabase.rpc('dashboard_revenue_summary', params),
        previousStart && previousEnd ? { start: new Date(previousStart), end: new Date(previousEnd) } : undefined,
      );
      if (request !== sequence.current) return;
      setResult({ key, orgId, report });
    } catch (cause) {
      if (request !== sequence.current) return;
      setFailure({ key, message: cause instanceof Error ? cause.message : 'Revenue could not load.' });
    } finally {
      if (request === sequence.current) setIsFetching(false);
    }
  }, [orgId, start, end, filters.assignedTo, filters.locationId, key, previousStart, previousEnd]);

  useEffect(() => {
    void refresh();
    return () => { sequence.current += 1; };
  }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    const refetch = debounceRefetch(refresh);
    const channel = supabase.channel(`revenue-tile-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deals', filter: `org_id=eq.${orgId}` }, refetch)
      .subscribe();
    window.addEventListener('focus', refetch);
    return () => {
      window.removeEventListener('focus', refetch);
      refetch.cancel();
      void supabase.removeChannel(channel);
    };
  }, [orgId, refresh]);

  const error = !range ? 'Choose a valid date range.' : failure?.key === key ? failure.message : null;
  return {
    range,
    comparison,
    report: result?.key === key ? result.report : null,
    options: result?.orgId === orgId ? result.report : null,
    isLoading: !error && (isFetching || result?.key !== key),
    error,
    refresh,
  };
}
