import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { commissionMonthDate, type PaidCommissionSalesperson, type PaidCommissionValues } from '@/lib/paidCommissions';
import type { PaidCommission } from '@/types/database';

interface SavePaidCommissionInput extends PaidCommissionValues {
  salespersonName: PaidCommissionSalesperson;
}

export function usePaidCommissions(month: string) {
  const { profile } = useAuth();
  const [entries, setEntries] = useState<PaidCommission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const monthDate = commissionMonthDate(month);
    if (!profile || !monthDate) {
      setEntries([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    const result = await supabase
      .from('paid_commissions')
      .select('id,org_id,commission_month,salesperson_name,customer_name,sale_amount,commission_percentage,commission_amount,created_by,created_at,updated_at')
      .eq('org_id', profile.org_id)
      .eq('commission_month', monthDate)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (result.error) {
      console.error('Error loading paid commissions:', result.error);
      setError(result.error.message);
    } else {
      setEntries((result.data ?? []) as PaidCommission[]);
      setError(null);
    }
    setIsLoading(false);
  }, [month, profile]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveEntry = useCallback(async (input: SavePaidCommissionInput, id?: string) => {
    const monthDate = commissionMonthDate(month);
    if (!profile || !monthDate) return false;
    const values = {
      commission_month: monthDate,
      salesperson_name: input.salespersonName,
      customer_name: input.customerName.trim(),
      sale_amount: input.saleAmount,
      commission_percentage: input.commissionPercentage,
    };
    const query = id
      ? supabase.from('paid_commissions').update(values).eq('id', id).eq('org_id', profile.org_id)
      : supabase.from('paid_commissions').insert({ ...values, org_id: profile.org_id, created_by: profile.id });
    const result = await query.select('id');
    if (result.error || !result.data?.length) {
      const message = result.error?.message ?? 'No paid commission row was saved.';
      console.error('Error saving paid commission:', result.error ?? message);
      setError(message);
      return false;
    }
    await refresh();
    return true;
  }, [month, profile, refresh]);

  const deleteEntry = useCallback(async (id: string) => {
    if (!profile) return false;
    const result = await supabase.from('paid_commissions')
      .delete()
      .eq('id', id)
      .eq('org_id', profile.org_id)
      .select('id');
    if (result.error || !result.data?.length) {
      const message = result.error?.message ?? 'No paid commission row was deleted.';
      console.error('Error deleting paid commission:', result.error ?? message);
      setError(message);
      return false;
    }
    await refresh();
    return true;
  }, [profile, refresh]);

  return { entries, isLoading, error, refresh, saveEntry, deleteEntry };
}
