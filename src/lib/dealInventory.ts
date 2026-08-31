import type { InventoryItem } from '@/types/database';

export type DealFulfillmentType = 'inventory' | 'special_order';

export type DealInventoryOption = Pick<
  InventoryItem,
  'id' | 'sku' | 'product' | 'brand' | 'model' | 'color_finish' | 'location_id'
> & {
  category?: InventoryItem['category'];
  status?: InventoryItem['status'];
  notes?: InventoryItem['notes'];
  created_at?: InventoryItem['created_at'];
  customer_id?: InventoryItem['customer_id'];
  stock_state?: InventoryItem['stock_state'];
  order_date?: InventoryItem['order_date'];
  date_received?: InventoryItem['date_received'];
  date_delivered?: InventoryItem['date_delivered'];
  customer?: { first_name: string; last_name: string } | null;
  locations?: { name: string } | null;
};

export type DealInventoryDisplay =
  | { kind: 'special_order'; items: [] }
  | { kind: 'inventory'; source: 'deal' | 'customer'; items: DealInventoryOption[] };

export type DealInventoryReservation = {
  id: string;
  inventory_item_id: string | null;
};

export function availableDealInventory(
  items: DealInventoryOption[],
  reservations: DealInventoryReservation[],
  currentDealId: string,
  currentInventoryItemId: string | null,
): DealInventoryOption[] {
  const reservedByAnotherDeal = new Set(
    reservations
      .filter(reservation => reservation.id !== currentDealId && reservation.inventory_item_id)
      .map(reservation => reservation.inventory_item_id as string),
  );

  return items.filter(item => item.id === currentInventoryItemId || !reservedByAnotherDeal.has(item.id));
}

export function dealInventoryForDisplay({
  fulfillmentType,
  linkedInventory,
  customerInventory,
}: {
  fulfillmentType: DealFulfillmentType | null;
  linkedInventory: DealInventoryOption | null;
  customerInventory: DealInventoryOption[];
}): DealInventoryDisplay | null {
  if (fulfillmentType === 'special_order') return { kind: 'special_order', items: [] };
  if (linkedInventory) return { kind: 'inventory', source: 'deal', items: [linkedInventory] };
  if (customerInventory.length > 0) return { kind: 'inventory', source: 'customer', items: customerInventory };
  return fulfillmentType === 'inventory' ? { kind: 'inventory', source: 'deal', items: [] } : null;
}

export function inventoryUnitLabel(item: DealInventoryOption): string {
  const product = [item.brand, item.model || item.product, item.color_finish]
    .filter(Boolean)
    .join(' · ');
  const store = item.locations?.name ? ` · ${item.locations.name}` : '';
  return `${product} · Serial ${item.sku}${store}`;
}

export function closeDealSaleArgs({
  dealId,
  stageId,
  fulfillmentType,
  inventoryItemId,
}: {
  dealId: string;
  stageId: string;
  fulfillmentType: DealFulfillmentType | null;
  inventoryItemId: string;
}) {
  if (!fulfillmentType) throw new Error('Choose a current inventory unit or Special order.');
  if (fulfillmentType === 'inventory' && !inventoryItemId) {
    throw new Error('Choose the purchased inventory unit.');
  }

  return {
    p_deal_id: dealId,
    p_stage_id: stageId,
    p_fulfillment_type: fulfillmentType,
    p_inventory_item_id: fulfillmentType === 'inventory' ? inventoryItemId : null,
  };
}
