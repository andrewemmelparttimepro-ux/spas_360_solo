import { useCallback, useEffect, useRef, useState } from 'react';
import {isMorningSummary} from '@/lib/operationalSnapshots';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { MorningSummary } from '@/lib/morningSummary';
import { shiftDateKey } from '@/lib/morningSummary';

export function useMorningSummary(day: string, enabled: boolean) {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSequence = useRef(0);

  const refresh = useCallback(async () => {
    if (!profile || !enabled) return;
    const sequence = ++fetchSequence.current;
    setIsLoading(true);
    // The card is dated for the workday ahead; its performance facts come from
    // the immediately preceding Central-time day.
    const { data, error: rpcError } = await supabase.rpc('owner_morning_summary', { p_day: shiftDateKey(day, -1) }).abortSignal(AbortSignal.timeout(15000));
    if (sequence !== fetchSequence.current) return;
    setIsLoading(false);
    if (rpcError || !isMorningSummary(data)) {
      setError(rpcError?.message || 'The summary response was incomplete. Retry to load current facts.');
      return;
    }
    setError(null);
    setSummary(data);
  }, [profile, day, enabled]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { summary, isLoading, error, refresh };
}
