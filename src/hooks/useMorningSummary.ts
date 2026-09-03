import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { MorningSummary } from '@/lib/morningSummary';

export function useMorningSummary(day: string, enabled: boolean) {
  const { profile } = useAuth();
  const [summary, setSummary] = useState<MorningSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile || profile.role !== 'owner_manager' || !enabled) return;
    setIsLoading(true);
    const { data, error: rpcError } = await supabase.rpc('owner_morning_summary', { p_day: day });
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
