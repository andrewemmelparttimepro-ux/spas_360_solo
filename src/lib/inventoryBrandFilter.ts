export const ALL_INVENTORY_BRANDS = 'All Brands';

type BrandInventoryItem = { brand?: string | null };

const normalizedBrand = (brand: string | null | undefined) => brand?.trim() ?? '';

export function inventoryBrandOptions(items: BrandInventoryItem[]): string[] {
  return Array.from(new Set(items.map(item => normalizedBrand(item.brand)).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
}

export function inventoryMatchesBrand(item: BrandInventoryItem, selectedBrand: string): boolean {
  return selectedBrand === ALL_INVENTORY_BRANDS || normalizedBrand(item.brand) === selectedBrand;
}
