import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { sanitizeSearchTerm } from '@/lib/utils';
import type { InventoryItem } from '@/types/database';
import {
  isAvailableInventoryStock,
  isCompletedDealSaleInventory,
  mergeInventoryDealAssignments,
  type InventoryDealAssignmentRow,
  type InventoryWithDealAssignment,
} from '@/lib/inventoryDealAssignment';

export type InventoryListItem = InventoryWithDealAssignment;

export function useInventory(enabled = true) {
  const { profile, activeLocationId } = useAuth();
  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const latestFetchId = useRef(0);

  const fetchItems = useCallback(async () => {
    if (!profile || !enabled) {
      setItems([]);
      setIsLoading(false);
      return;
    }
    const fetchId = ++latestFetchId.current;

    let query = supabase
      .from('inventory_items')
      .select('*, locations:location_id(name), customer:customer_id(id, first_name, last_name, phone, customer_type), job:job_id(id, status)')
      .eq('org_id', profile.org_id)
      .is('removed_at', null)
      .order('created_at', { ascending: false });

    if (activeLocationId) {
      query = query.eq('location_id', activeLocationId);
    }

    const needle = sanitizeSearchTerm(searchQuery);
    if (needle) {
      query = query.or(`sku.ilike.%${needle}%,product.ilike.%${needle}%,category.ilike.%${needle}%`);
    }

    const [inventoryResult, assignmentResult] = await Promise.all([
      query,
      supabase
        .from('deals')
        .select('id, inventory_item_id, contact:contact_id(id, first_name, last_name, phone, customer_type)')
        .eq('org_id', profile.org_id)
        .not('inventory_item_id', 'is', null),
    ]);

    if (inventoryResult.error || assignmentResult.error) {
      console.error(
        'Error fetching inventory assignments:',
        inventoryResult.error ?? assignmentResult.error,
      );
      if (fetchId === latestFetchId.current) setIsLoading(false);
      return;
    }

    // Search and realtime refreshes keep the page mounted so the search input
    // retains focus. Ignore slower responses for older keystrokes as well.
    if (fetchId !== latestFetchId.current) return;

    setItems(mergeInventoryDealAssignments(
      (inventoryResult.data ?? []) as unknown as Parameters<typeof mergeInventoryDealAssignments>[0],
      (assignmentResult.data ?? []) as unknown as InventoryDealAssignmentRow[],
    ));
    setIsLoading(false);
  }, [profile, activeLocationId, searchQuery, enabled]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Inventory fields and Deal Detail reservations both feed this table.
  useEffect(() => {
    if (!profile || !enabled) return;
    const orgFilter = `org_id=eq.${profile.org_id}`;
    const channel = supabase
      .channel(`inventory-realtime-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory_items',
        filter: orgFilter,
      }, fetchItems)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'deals',
        filter: orgFilter,
      }, fetchItems)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'jobs',
        filter: orgFilter,
      }, fetchItems)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchItems, enabled]);

  const totalInStock = items.filter(isAvailableInventoryStock).length;
  const awaitingDelivery = items.filter(i => i.status === 'Sold').length;
  const onOrder = items.filter(i => i.status === 'On Order').length;
  const chemicalSkus = items.filter(i => i.category === 'Chemicals');
  const chemicalsInStock = chemicalSkus.filter(i => i.status === 'In Stock').length;
  const lowStockAlerts = chemicalSkus.length > 0 && chemicalsInStock < 5 ? 1 : 0;

  const createItem = useCallback(async (item: Partial<InventoryItem>) => {
    if (!profile) return null;
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({ ...item, org_id: profile.org_id } as InventoryItem)
      .select()
      .single();
    if (error) { console.error('Error creating inventory item:', error); return null; }
    await fetchItems();
    return data;
  }, [profile, fetchItems]);

  const updateItem = useCallback(async (id: string, updates: Partial<InventoryItem>) => {
    // Returning the row distinguishes a real update from an RLS-filtered zero-row response.
    const { data, error } = await supabase
      .from('inventory_items')
      .update(updates)
      .eq('id', id)
      .select('id');
    if (error || !data || data.length === 0) {
      console.error('Error updating inventory item:', error ?? 'no rows updated (permissions?)');
      return false;
    }
    await fetchItems();
    return true;
  }, [fetchItems]);

  const removeItem = useCallback(async (id: string) => {
    const { data, error } = await supabase.rpc('remove_inventory_item', {
      p_inventory_item_id: id,
    });
    if (error || data !== id) {
      console.error('Error removing inventory item:', error ?? 'unexpected removal result');
      return false;
    }
    await fetchItems();
    return true;
  }, [fetchItems]);

  return {
    items,
    isLoading,
    searchQuery,
    setSearchQuery,
    totalInStock,
    awaitingDelivery,
    onOrder,
    lowStockAlerts,
    createItem,
    updateItem,
    removeItem,
    isCompletedSale: isCompletedDealSaleInventory,
    refresh: fetchItems,
  };
}
