import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type { InventoryItem } from '@/types/database';

export function useInventory() {
  const { profile, activeLocationId } = useAuth();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchItems = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    let query = supabase
      .from('inventory_items')
      .select('*')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false });

    if (activeLocationId) {
      query = query.eq('location_id', activeLocationId);
    }

    if (searchQuery.trim()) {
      query = query.or(`sku.ilike.%${searchQuery}%,product.ilike.%${searchQuery}%,category.ilike.%${searchQuery}%`);
    }

    const { data, error } = await query;
    if (error) console.error('Error fetching inventory:', error);
    setItems(data ?? []);
    setIsLoading(false);
  }, [profile, activeLocationId, searchQuery]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Real-time subscription â any INSERT/UPDATE/DELETE on inventory_items refreshes everywhere
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel('inventory-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'inventory_items',
      }, () => {
        fetchItems();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [profile, fetchItems]);

  const totalInStock = items.filter(i => i.status === 'In Stock').length;
  const awaitingDelivery = items.filter(i => i.status === 'Sold').length;
  const onOrder = items.filter(i => i.status === 'On Order').length;
  const lowStockAlerts = items.filter(i => i.category === 'Chemicals' && i.status === 'In Stock').length < 5 ? 1 : 0;

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
    const { error } = await supabase.from('inventory_items').update(updates).eq('id', id);
    if (error) { console.error('Error updating inventory item:', error); return false; }
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
    refresh: fetchItems,
  };
}
