export const ALL_INVENTORY_BRANDS = 'All Inventory';

export const INVENTORY_BRAND_CHOICES = [
  'Ashley Furniture',
  'Eco Spas',
  'Finnleo Saunas',
  'FinnSaunas',
  'GDI Saunas',
  'Lux Craft',
  'Master Spas',
  'Other',
  'Platinum Spas',
  'Pool',
  'Sundance',
  'Visscher',
] as const;

export const INVENTORY_GROUP_FILTERS = [
  'Saunas',
  'Outdoor Living',
  'Pools',
  'Covers',
  'Need To Order',
  'Used Inventory',
  'All Other',
] as const;

type BrandInventoryItem = { brand?: string | null; category?: string | null; status?: string | null };

const normalizedBrand = (brand: string | null | undefined) => brand?.trim() ?? '';

export function inventoryBrandOptions(items: BrandInventoryItem[]): string[] {
  const brands = Array.from(new Set(items
    .map(item => normalizedBrand(item.brand))
    .filter(brand => brand && !INVENTORY_GROUP_FILTERS.includes(brand as typeof INVENTORY_GROUP_FILTERS[number]))))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
  return [...brands, ...INVENTORY_GROUP_FILTERS];
}

export function inventoryMatchesBrand(item: BrandInventoryItem, selectedBrand: string): boolean {
  if (selectedBrand === ALL_INVENTORY_BRANDS) return true;
  if (!INVENTORY_GROUP_FILTERS.includes(selectedBrand as typeof INVENTORY_GROUP_FILTERS[number])) {
    return normalizedBrand(item.brand) === selectedBrand;
  }

  const category = item.category?.trim() ?? '';
  if (selectedBrand === 'Saunas') return category === 'Saunas' || category === 'Saunas & Specialty';
  if (selectedBrand === 'Outdoor Living') return category === 'Outdoor Living';
  if (selectedBrand === 'Pools') return category === 'Pools';
  if (selectedBrand === 'Covers') return category === 'Covers';
  if (selectedBrand === 'Need To Order') return item.status === 'On Order';
  if (selectedBrand === 'Used Inventory') return category === 'Used Spas' || category === 'Used Inventory';

  const namedCategory = ['Saunas', 'Saunas & Specialty', 'Outdoor Living', 'Pools', 'Covers', 'Used Spas', 'Used Inventory'].includes(category);
  return !normalizedBrand(item.brand) && !namedCategory && item.status !== 'On Order';
}
