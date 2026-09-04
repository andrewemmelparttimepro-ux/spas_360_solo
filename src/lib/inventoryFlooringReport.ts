import { splitSerialAndFlooring } from './inventoryFields.ts';
import type { InventoryItem } from '../types/database.ts';

export type InventoryFlooringReportItem = Pick<
  InventoryItem,
  'id' | 'location_id' | 'sku' | 'product' | 'brand' | 'model' | 'status' | 'cost'
> & {
  locations?: { name?: string | null } | null;
};

export const inventoryFlooringDesignation = (item: Pick<InventoryItem, 'sku'>) =>
  splitSerialAndFlooring(item.sku).flooring.trim();

export function inventoryFlooringOptions(items: InventoryFlooringReportItem[]) {
  const options = new Map<string, string>();
  items.forEach(item => {
    const designation = inventoryFlooringDesignation(item);
    if (designation && !options.has(designation.toLocaleLowerCase())) {
      options.set(designation.toLocaleLowerCase(), designation);
    }
  });
  return [...options.values()].sort((left, right) => left.localeCompare(right));
}

export function inventoryForFlooring(
  items: InventoryFlooringReportItem[],
  designation: string,
) {
  const selected = designation.trim().toLocaleLowerCase();
  if (!selected) return items;
  return items.filter(item =>
    inventoryFlooringDesignation(item).toLocaleLowerCase() === selected,
  );
}

export function inventoryFlooringCostTotal(items: InventoryFlooringReportItem[]) {
  return items.reduce((total, item) => {
    const cost = Number(item.cost);
    return total + (Number.isFinite(cost) ? cost : 0);
  }, 0);
}
