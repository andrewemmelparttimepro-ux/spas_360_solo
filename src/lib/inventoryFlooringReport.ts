import { splitSerialAndFlooring } from './inventoryFields.ts';
import type { InventoryItem } from '../types/database.ts';

export type InventoryFlooringReportItem = Pick<
  InventoryItem,
  'id' | 'location_id' | 'sku' | 'product' | 'brand' | 'model' | 'status' | 'flooring_amount' | 'notes'
> & {
  locations?: { name?: string | null } | null;
};

const LEGACY_FLOORING_SEGMENT = /(?:^|·)\s*Flooring:\s*(.*?)(?=\s*·|$)/i;

export const inventoryFlooringDesignation = (
  item: Pick<InventoryItem, 'sku' | 'notes'>,
) => {
  const skuFlooring = splitSerialAndFlooring(item.sku).flooring.trim();
  return skuFlooring || item.notes?.match(LEGACY_FLOORING_SEGMENT)?.[1]?.trim() || '';
};

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

export function inventoryFlooringAmountSummary(items: InventoryFlooringReportItem[]) {
  return items.reduce((summary, item) => {
    if (item.flooring_amount === null || item.flooring_amount === undefined) {
      summary.missingCount += 1;
      return summary;
    }
    const amount = Number(item.flooring_amount);
    if (!Number.isFinite(amount)) {
      summary.missingCount += 1;
      return summary;
    }
    summary.recordedCount += 1;
    summary.total += amount;
    return summary;
  }, { total: 0, recordedCount: 0, missingCount: 0 });
}
