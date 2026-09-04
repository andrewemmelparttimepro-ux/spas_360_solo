import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import type { InventoryFlooringReportItem } from '@/lib/inventoryFlooringReport';

const PAGE_SIZE = 1000;

export function useInventoryFlooringReport(enabled = true) {
  const { profile } = useAuth();
  const [items, setItems] = useState<InventoryFlooringReportItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestFetchId = useRef(0);

  const fetchItems = useCallback(async () => {
    if (!profile || profile.role !== 'owner_manager' || !enabled) {
      setItems([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    const fetchId = ++latestFetchId.current;
    setIsLoading(true);
    setError(null);
    const allItems: InventoryFlooringReportItem[] = [];

    for (let from = 0; ; from += PAGE_SIZE) {
      const result = await supabase
        .from('inventory_items')
        .select('id, location_id, sku, product, brand, model, status, flooring_amount, notes, locations:location_id(name)')
        .eq('org_id', profile.org_id)
        .is('removed_at', null)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

      if (result.error) {
        if (fetchId === latestFetchId.current) {
          setError(result.error.message);
          setIsLoading(false);
        }
        return;
      }

      const page = (result.data ?? []) as unknown as InventoryFlooringReportItem[];
      allItems.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    if (fetchId !== latestFetchId.current) return;
    setItems(allItems);
    setIsLoading(false);
  }, [enabled, profile]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    if (!profile || profile.role !== 'owner_manager' || !enabled) return;
    const channel = supabase
      .channel(`inventory-flooring-report-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory_items',
        filter: `org_id=eq.${profile.org_id}`,
      }, fetchItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, fetchItems, profile]);

  const updateAmount = useCallback(async (itemId: string, flooringAmount: number | null) => {
    if (!profile || profile.role !== 'owner_manager') {
      throw new Error('Owner access is required to edit flooring amounts.');
    }

    const result = await supabase
      .from('inventory_items')
      .update({ flooring_amount: flooringAmount })
      .eq('id', itemId)
      .eq('org_id', profile.org_id)
      .is('removed_at', null)
      .select('id, flooring_amount')
      .single();

    if (result.error) throw new Error(result.error.message);
    setItems(current => current.map(item => item.id === itemId
      ? { ...item, flooring_amount: result.data.flooring_amount }
      : item));
  }, [profile]);

  return { items, isLoading, error, refresh: fetchItems, updateAmount };
}
