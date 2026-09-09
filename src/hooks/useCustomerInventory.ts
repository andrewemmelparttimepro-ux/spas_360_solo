import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { debounceRefetch } from '@/lib/realtime';
import { customerInventoryForDisplay, type CustomerInventoryItem } from '@/lib/customerInventory';

const fields = 'id, brand, model, product, color_finish, sku, customer_id, job:jobs!job_id(contact_id), deal:deals!deal_id(contact_id), reservations:deals!inventory_item_id(contact_id)';
const pageSize = 500;

export function useCustomerInventory(customerId: string) {
  const { profile } = useAuth();
  const orgId = profile?.org_id;
  const scope = `${profile?.id ?? ''}:${orgId ?? ''}:${customerId}`;
  const [state, setState] = useState<{ scope: string; items: CustomerInventoryItem[]; loading: boolean; error: string | null }>({ scope: '', items: [], loading: true, error: null });
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    if (!orgId || !customerId) {
      setState({ scope, items: [], loading: false, error: null });
      return;
    }
    setState({ scope, items: [], loading: true, error: null });
    const timeout = setTimeout(() => abort.abort(), 15_000);
    try {
      // Each path is customer-scoped, across all jobs, deals, and locations.
      // Separate inner-filter aliases leave the display relations unfiltered,
      // so an older relationship cannot hide a different current reservation.
      const paths = [
        { extra: '', column: 'customer_id' },
        { extra: ', matching_job:jobs!job_id!inner(contact_id)', column: 'matching_job.contact_id' },
        { extra: ', matching_deal:deals!deal_id!inner(contact_id)', column: 'matching_deal.contact_id' },
        { extra: ', matching_reservation:deals!inventory_item_id!inner(contact_id)', column: 'matching_reservation.contact_id' },
      ];
      const groups = await Promise.all(paths.map(async path => {
        const rows: CustomerInventoryItem[] = [];
        const selection: string = fields + path.extra;
        for (let offset = 0; ; offset += pageSize) {
          const result = await supabase.from('inventory_items')
            .select(selection)
            .eq('org_id', orgId)
            .is('removed_at', null)
            .filter(path.column, 'eq', customerId)
            .order('id')
            .range(offset, offset + pageSize - 1)
            .abortSignal(abort.signal)
            .returns<CustomerInventoryItem[]>();
          if (result.error) throw result.error;
          const page = result.data ?? [];
          rows.push(...page);
          if (page.length < pageSize) return rows;
        }
      }));
      if (request === sequence.current) setState({ scope, items: customerInventoryForDisplay(customerId, groups), loading: false, error: null });
    } catch {
      if (request === sequence.current) setState({ scope, items: [], loading: false, error: 'Customer inventory could not load.' });
    } finally {
      clearTimeout(timeout);
    }
  }, [customerId, orgId, scope]);

  useEffect(() => {
    void refresh();
    return () => { sequence.current++; controller.current?.abort(); };
  }, [refresh]);

  useEffect(() => {
    if (!orgId) return;
    const refetch = debounceRefetch(() => { void refresh(); });
    const channel = supabase.channel(`customer-inventory-${scope}-${Math.random().toString(36).slice(2)}`);
    for (const table of ['inventory_items', 'jobs', 'deals']) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `org_id=eq.${orgId}` }, refetch);
    }
    channel.subscribe();
    return () => { refetch.cancel(); void supabase.removeChannel(channel); };
  }, [orgId, scope, refresh]);

  return state.scope === scope ? { ...state, refresh } : { items: [], loading: true, error: null, refresh };
}
