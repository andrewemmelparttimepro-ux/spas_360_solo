import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import {
  inventorySkuForFlooringDesignation,
  isInventoryFlooringDesignation,
  type InventoryFlooringDesignation,
  type InventoryFlooringReportItem,
} from '@/lib/inventoryFlooringReport';
import type { InventoryFlooringRow } from '@/types/database';

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
    const inventoryItems: Omit<InventoryFlooringReportItem, 'flooring_report'>[] = [];

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

      const page = (result.data ?? []) as unknown as Omit<InventoryFlooringReportItem, 'flooring_report'>[];
      inventoryItems.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const flooringRows: InventoryFlooringRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const result = await supabase
        .from('inventory_flooring_rows')
        .select('inventory_item_id, org_id, status_text, background_color, report_removed_at, version, updated_at, updated_by')
        .eq('org_id', profile.org_id)
        .order('inventory_item_id')
        .range(from, from + PAGE_SIZE - 1);

      if (result.error) {
        if (fetchId === latestFetchId.current) {
          setError(result.error.message);
          setIsLoading(false);
        }
        return;
      }

      const page = (result.data ?? []) as InventoryFlooringRow[];
      flooringRows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    const rowsByInventoryId = new Map(flooringRows.map(row => [row.inventory_item_id, row]));
    const allItems = inventoryItems.flatMap(item => {
      const flooringReport = rowsByInventoryId.get(item.id);
      return flooringReport ? [{ ...item, flooring_report: flooringReport }] : [];
    });

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
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory_flooring_rows',
        filter: `org_id=eq.${profile.org_id}`,
      }, fetchItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [enabled, fetchItems, profile]);

  const updateAmount = useCallback(async (item: InventoryFlooringReportItem, flooringAmount: number | null) => {
    if (!profile || profile.role !== 'owner_manager') {
      throw new Error('Owner access is required to edit flooring amounts.');
    }

    let request = supabase
      .from('inventory_items')
      .update({ flooring_amount: flooringAmount })
      .eq('id', item.id)
      .eq('org_id', profile.org_id)
      .is('removed_at', null);
    request = item.flooring_amount === null
      ? request.is('flooring_amount', null)
      : request.eq('flooring_amount', item.flooring_amount);
    const result = await request.select('id, flooring_amount').maybeSingle();

    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error('This amount changed elsewhere. Refresh and try again.');
    setItems(current => current.map(currentItem => currentItem.id === item.id
      ? { ...currentItem, flooring_amount: result.data.flooring_amount }
      : currentItem));
  }, [profile]);

  const updateDesignation = useCallback(async (
    item: InventoryFlooringReportItem,
    designation: InventoryFlooringDesignation,
  ) => {
    if (!profile || profile.role !== 'owner_manager') {
      throw new Error('Owner access is required to edit flooring status.');
    }
    if (!isInventoryFlooringDesignation(designation)) {
      throw new Error('Choose a valid flooring status.');
    }

    const sku = inventorySkuForFlooringDesignation(item.sku, designation);
    if (sku === item.sku) return;

    const result = await supabase
      .from('inventory_items')
      .update({ sku })
      .eq('id', item.id)
      .eq('org_id', profile.org_id)
      .eq('sku', item.sku)
      .is('removed_at', null)
      .select('id, sku')
      .maybeSingle();

    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error('This flooring status changed elsewhere. Refresh and try again.');
    setItems(current => current.map(currentItem => currentItem.id === item.id
      ? { ...currentItem, sku: result.data.sku }
      : currentItem));
  }, [profile]);

  const updateFlooringRow = useCallback(async (
    item: InventoryFlooringReportItem,
    field: 'status_text' | 'background_color' | 'report_removed',
    value: string | null,
  ) => {
    if (!profile || profile.role !== 'owner_manager') {
      throw new Error('Owner access is required to edit this flooring report.');
    }

    const result = await supabase.rpc('set_inventory_flooring_row_value', {
      p_inventory_item_id: item.id,
      p_expected_version: item.flooring_report.version,
      p_field: field,
      p_value: value,
    });

    if (result.error) throw new Error(result.error.message);
    if (!result.data) throw new Error('This row changed elsewhere. Refresh and try again.');
    const flooringReport = result.data as unknown as InventoryFlooringRow;
    setItems(current => current.map(currentItem => currentItem.id === item.id
      ? { ...currentItem, flooring_report: flooringReport }
      : currentItem));
  }, [profile]);

  const updateStatusText = useCallback((item: InventoryFlooringReportItem, statusText: string) => {
    const normalized = statusText.trim();
    if (normalized.length > 120) throw new Error('Status must be 120 characters or fewer.');
    return updateFlooringRow(item, 'status_text', normalized || null);
  }, [updateFlooringRow]);

  const updateBackgroundColor = useCallback((item: InventoryFlooringReportItem, backgroundColor: string | null) => {
    if (backgroundColor !== null && !/^#[0-9a-f]{6}$/i.test(backgroundColor)) {
      throw new Error('Choose a valid row color.');
    }
    return updateFlooringRow(item, 'background_color', backgroundColor);
  }, [updateFlooringRow]);

  const setReportRemoved = useCallback((item: InventoryFlooringReportItem, removed: boolean) =>
    updateFlooringRow(item, 'report_removed', String(removed)),
  [updateFlooringRow]);

  return {
    items,
    isLoading,
    error,
    refresh: fetchItems,
    updateAmount,
    updateDesignation,
    updateStatusText,
    updateBackgroundColor,
    setReportRemoved,
  };
}
