import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { sanitizeSearchTerm } from '@/lib/utils';
import type { Contact, InventoryItem } from '@/types/database';

export type InventoryListItem = InventoryItem & {
  customer: Pick<Contact, 'id' | 'first_name' | 'last_name' | 'phone' | 'customer_type'> | null;
  locations?: { name: string } | null;
};

export function useInventory() {
  const { profile, activeLocationId } = useAuth();
  const [items, setItems] = useState<InventoryListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchItems = useCallback(async () => {
    if (!profile) return;
    setIsLoading(true);

    let query = supabase
      .from('inventory_items')
      .select('*, locations:location_id(name), customer:customer_id(id, first_name, last_name, phone, customer_type)')
      .eq('org_id', profile.org_id)
      .order('created_at', { ascending: false });

    if (activeLocationId) {
      query = query.eq('location_id', activeLocationId);
    }

    const needle = sanitizeSearchTerm(searchQuery);
    if (needle) {
      query = query.or(`sku.ilike.%${needle}%,product.ilike.%${needle}%,category.ilike.%${needle}%`);
    }

    const { data, error } = await query;
    if (error) console.error('Error fetching inventory:', error);
    setItems((data ?? []) as InventoryListItem[]);
    setIsLoading(false);
  }, [profile, activeLocationId, searchQuery]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  // Real-time subscription — any INSERT/UPDATE/DELETE on inventory_items refreshes everywhere
  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`inventory-realtime-${Math.random().toString(36).slice(2)}`)
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

  const deleteItem = useCallback(async (id: string) => {
    // .select() so RLS-denied deletes (0 rows) report as failure, not silent success
    const { data, error } = await supabase.from('inventory_items').delete().eq('id', id).select('id');
    if (error || !data || data.length === 0) {
      console.error('Error deleting inventory item:', error ?? 'no rows deleted (permissions?)');
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
    deleteItem,
    refresh: fetchItems,
  };
}
