import { inventoryItems } from '@/data/inventory';

export function useInventory() {
  // Future: fetch from API, support search/filter/pagination
  return {
    items: inventoryItems,
    totalInStock: 42,
    awaitingDelivery: 14,
    onOrder: 8,
    lowStockAlerts: 3,
    isLoading: false,
  };
}
