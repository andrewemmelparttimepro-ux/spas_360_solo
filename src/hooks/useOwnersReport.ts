import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { OwnersReportDeal } from '@/lib/ownersReport';
import { THRAWN_PROFILE_ID } from '@/lib/upcomingTasks';

export interface OwnersReportOption { id: string; name: string }

const DEAL_PAGE_SIZE = 1000;

async function fetchAllDeals(orgId: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += DEAL_PAGE_SIZE) {
    const page = await supabase.from('deals')
      .select('id,title,amount,assigned_to,location_id,closed_at,created_at,stage:pipeline_stages(is_won,is_lost)')
      .eq('org_id', orgId)
      .order('id')
      .range(from, from + DEAL_PAGE_SIZE - 1);
    if (page.error) return { data: null, error: page.error };
    const pageRows = (page.data ?? []) as Record<string, unknown>[];
    rows.push(...pageRows);
    if (pageRows.length < DEAL_PAGE_SIZE) return { data: rows, error: null };
  }
}

export function useOwnersReport() {
  const { profile } = useAuth();
  const [deals, setDeals] = useState<OwnersReportDeal[]>([]);
  const [stores, setStores] = useState<OwnersReportOption[]>([]);
  const [salespeople, setSalespeople] = useState<OwnersReportOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);
    const [dealsResult, storesResult, peopleResult] = await Promise.all([
      fetchAllDeals(profile.org_id),
      supabase.from('locations').select('id,name').eq('org_id', profile.org_id).order('name'),
      supabase.from('profiles').select('id,first_name,last_name').eq('org_id', profile.org_id)
        .in('role', ['owner_manager', 'service_manager', 'salesperson'])
        .neq('id', THRAWN_PROFILE_ID)
        .order('first_name'),
    ]);
    const firstError = dealsResult.error ?? storesResult.error ?? peopleResult.error;
    if (firstError) console.error('Error loading Owners Corner reports:', firstError);
    setError(firstError?.message ?? null);
    if (!dealsResult.error) {
      setDeals((dealsResult.data ?? []).map((row: Record<string, unknown>) => ({
        ...row,
        stage: (Array.isArray(row.stage) ? row.stage[0] : row.stage) as OwnersReportDeal['stage'],
      })) as OwnersReportDeal[]);
    }
    if (!storesResult.error) setStores((storesResult.data ?? []) as OwnersReportOption[]);
    if (!peopleResult.error) setSalespeople((peopleResult.data ?? []).map(person => ({
      id: person.id,
      name: `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() || 'Unnamed salesperson',
    })));
    setIsLoading(false);
  }, [profile]);

  useEffect(() => { refresh(); }, [refresh]);
  return { deals, stores, salespeople, isLoading, error, refresh };
}
