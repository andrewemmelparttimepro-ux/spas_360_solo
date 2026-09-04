import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { MorningSummary } from '@/lib/morningSummary';
import { shiftDateKey } from '@/lib/morningSummary';

export function useMorningSummary(day: string, enabled: boolean) {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile || !enabled) return;
    setIsLoading(true);
    // The card is dated for the workday ahead; its performance facts come from
    // the immediately preceding Central-time day.
    const { data, error: rpcError } = await supabase.rpc('owner_morning_summary', { p_day: shiftDateKey(day, -1) });
    setIsLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setError(null);
    setSummary(data as MorningSummary);
  }, [profile, day, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { summary, isLoading, error, refresh };
}
