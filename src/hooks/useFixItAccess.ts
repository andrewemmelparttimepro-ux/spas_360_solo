import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

export interface FixItAccessState {
  canUseFixIt: boolean;
  isLoading: boolean;
}

/**
 * Fix-It membership is an explicit server-side allowlist. Roles are not used:
 * Matt is a salesperson who needs access, while other managers do not.
 */
export function useFixItAccess(): FixItAccessState {
  const { profile } = useAuth();
  const [canUseFixIt, setCanUseFixIt] = useState(false);
  const [isLoading, setIsLoading] = useState(Boolean(profile));

  useEffect(() => {
    let cancelled = false;

    if (!profile?.id) {
      setCanUseFixIt(false);
      setIsLoading(false);
      return () => { cancelled = true; };
    }

    setCanUseFixIt(false);
    setIsLoading(true);
    void supabase.rpc('can_use_fix_it').then(({ data, error }) => {
      if (cancelled) return;
      setCanUseFixIt(!error && data === true);
      setIsLoading(false);
    });

    return () => { cancelled = true; };
  }, [profile?.id]);

  return { canUseFixIt, isLoading };
}
