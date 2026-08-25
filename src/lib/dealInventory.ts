import type { InventoryItem } from '@/types/database';

export type DealFulfillmentType = 'inventory' | 'special_order';

export type DealInventoryOption = Pick<
  InventoryItem,
  'id' | 'sku' | 'product' | 'brand' | 'model' | 'color_finish' | 'location_id'
> & {
  locations?: { name: string } | null;
};

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
