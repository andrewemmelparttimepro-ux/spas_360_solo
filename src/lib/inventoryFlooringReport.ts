import { joinSerialAndFlooring, splitSerialAndFlooring } from './inventoryFields.ts';
import type { InventoryItem } from '../types/database.ts';

export type InventoryFlooringReportItem = Pick<
  InventoryItem,
  'id' | 'location_id' | 'sku' | 'product' | 'brand' | 'model' | 'status' | 'flooring_amount' | 'notes'
> & {
  locations?: { name?: string | null } | null;
};

const LEGACY_FLOORING_SEGMENT = /(?:^|·)\s*Flooring:\s*(.*?)(?=\s*·|$)/i;

export const INVENTORY_FLOORING_DESIGNATIONS = [
  'Consignment Spa',
  'MCHL TCCU',
  'Spas Etc TCCU',
  'Wells Fargo Minot',
  'Wells Fargo Bismarck',
  'Owned by MCHL',
  'Owned by Spas Etc',
] as const;

export type InventoryFlooringDesignation = typeof INVENTORY_FLOORING_DESIGNATIONS[number];
export type InventoryFlooringStore = '' | 'Minot' | 'Bismarck';

export const isInventoryFlooringDesignation = (
  value: string,
): value is InventoryFlooringDesignation =>
  INVENTORY_FLOORING_DESIGNATIONS.includes(value as InventoryFlooringDesignation);

const canonicalFlooringDesignation = (
  designation: string,
  storeName?: string | null,
): string => {
  const normalized = designation.trim().toLocaleLowerCase();
  if (!normalized) return '';
  if (/^consign(?:e)?ment(?:\s+spa)?$/.test(normalized)) return 'Consignment Spa';
  if (/^(?:tccu(?:\s+minot)?|mchl\s+tccu)$/.test(normalized)) return 'MCHL TCCU';
  if (/^(?:spas\s+etc\s+tccu|spas\s+tccu)$/.test(normalized)) return 'Spas Etc TCCU';
  if (/^(?:mchl|magic\s+city\s+home\s+(?:leisure|ieisure)|owned\s+by\s+mchl)$/.test(normalized)) return 'Owned by MCHL';
  if (/^(?:spas\s+etc|owned\s+by\s+spas\s+etc)$/.test(normalized)) return 'Owned by Spas Etc';
  if (/^wells\s+fargo(?:\s+(?:minot|bismarck))?$/.test(normalized)) {
    if (normalized.endsWith('bismarck') || storeName?.trim().toLocaleLowerCase() === 'bismarck') {
      return 'Wells Fargo Bismarck';
    }
    return 'Wells Fargo Minot';
  }
  return designation.trim();
};

export const inventoryFlooringDesignation = (
  item: Pick<InventoryItem, 'sku' | 'notes'> & { locations?: { name?: string | null } | null },
) => {
  const skuFlooring = splitSerialAndFlooring(item.sku).flooring.trim();
  const stored = skuFlooring || item.notes?.match(LEGACY_FLOORING_SEGMENT)?.[1]?.trim() || '';
  return canonicalFlooringDesignation(stored, item.locations?.name);
};

export function inventoryFlooringOptions(_items?: InventoryFlooringReportItem[]) {
  return [...INVENTORY_FLOORING_DESIGNATIONS];
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

export function inventoryForStore(
  items: InventoryFlooringReportItem[],
  store: InventoryFlooringStore,
) {
  const selected = store.trim().toLocaleLowerCase();
  if (!selected) return items;
  return items.filter(item => item.locations?.name?.trim().toLocaleLowerCase() === selected);
}

export function inventorySkuForFlooringDesignation(
  sku: string,
  designation: string,
) {
  if (!isInventoryFlooringDesignation(designation)) {
    throw new Error('Choose a valid flooring status.');
  }
  return joinSerialAndFlooring(splitSerialAndFlooring(sku).serial, designation);
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
