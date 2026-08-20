export type InventoryGroupKey =
  | 'sundance'
  | 'master'
  | 'platinum'
  | 'eco'
  | 'saunas'
  | 'outdoor'
  | 'covers'
  | 'need_to_order'
  | 'used'
  | 'other';

export interface InventoryGroupingItem {
  id: string;
  brand?: string | null;
  category?: string | null;
  notes?: string | null;
  created_at?: string | null;
}

export interface InventorySourcePosition {
  sheet: string;
  row: number;
  unit: number;
}

export interface InventoryGroup<T extends InventoryGroupingItem> {
  key: InventoryGroupKey;
  label: string;
  tintClassName: string;
  headerClassName: string;
  dotClassName: string;
  items: T[];
}

const GROUPS: Record<InventoryGroupKey, Omit<InventoryGroup<InventoryGroupingItem>, 'items'>> = {
  sundance: { key: 'sundance', label: 'Sundance Spas', tintClassName: 'bg-emerald-500/[0.04] hover:bg-emerald-500/[0.09]', headerClassName: 'bg-emerald-500/10 text-emerald-800', dotClassName: 'bg-emerald-500' },
  master: { key: 'master', label: 'Master Spas', tintClassName: 'bg-sky-500/[0.04] hover:bg-sky-500/[0.09]', headerClassName: 'bg-sky-500/10 text-sky-800', dotClassName: 'bg-sky-500' },
  platinum: { key: 'platinum', label: 'Platinum Spas', tintClassName: 'bg-fuchsia-500/[0.04] hover:bg-fuchsia-500/[0.09]', headerClassName: 'bg-fuchsia-500/10 text-fuchsia-800', dotClassName: 'bg-fuchsia-500' },
  eco: { key: 'eco', label: 'Eco Spas', tintClassName: 'bg-amber-500/[0.04] hover:bg-amber-500/[0.09]', headerClassName: 'bg-amber-500/10 text-amber-800', dotClassName: 'bg-amber-500' },
  saunas: { key: 'saunas', label: 'Saunas & Specialty', tintClassName: 'bg-slate-500/[0.04] hover:bg-slate-500/[0.09]', headerClassName: 'bg-slate-500/10 text-slate-700', dotClassName: 'bg-slate-500' },
  outdoor: { key: 'outdoor', label: 'Outdoor Living', tintClassName: 'bg-orange-500/[0.04] hover:bg-orange-500/[0.09]', headerClassName: 'bg-orange-500/10 text-orange-800', dotClassName: 'bg-orange-500' },
  covers: { key: 'covers', label: 'Covers', tintClassName: 'bg-cyan-500/[0.04] hover:bg-cyan-500/[0.09]', headerClassName: 'bg-cyan-500/10 text-cyan-800', dotClassName: 'bg-cyan-500' },
  need_to_order: { key: 'need_to_order', label: 'Need to Order', tintClassName: 'bg-yellow-500/[0.06] hover:bg-yellow-500/[0.12]', headerClassName: 'bg-yellow-500/15 text-yellow-800', dotClassName: 'bg-yellow-500' },
  used: { key: 'used', label: 'Used Inventory', tintClassName: 'bg-violet-500/[0.04] hover:bg-violet-500/[0.09]', headerClassName: 'bg-violet-500/10 text-violet-800', dotClassName: 'bg-violet-500' },
  other: { key: 'other', label: 'Other Inventory', tintClassName: 'hover:bg-ink-800/60', headerClassName: 'bg-ink-800/70 text-ink-500', dotClassName: 'bg-ink-400' },
};

const GROUP_ORDER: InventoryGroupKey[] = ['sundance', 'master', 'platinum', 'eco', 'saunas', 'outdoor', 'covers', 'need_to_order', 'used', 'other'];
const SHEET_ORDER: Record<string, number> = { 'Bismarck Inventory': 0, 'Minot Inventory': 1, 'Used Inventory': 2 };

export function inventorySourcePosition(notes?: string | null): InventorySourcePosition | null {
  const marker = notes?.match(/\[FIXIT_IMPORT\b[^\]]*\bsheet=(?:"([^"]+)"|(.+?))\s+row=(\d+)(?:\s+unit=(\d+))?[^\]]*\]/i);
  if (!marker) return null;
  return { sheet: (marker[1] ?? marker[2]).trim(), row: Number(marker[3]), unit: marker[4] ? Number(marker[4]) : 1 };
}

export function inventoryGroupKey(item: InventoryGroupingItem): InventoryGroupKey {
  if (/(?:Need to order:\s*Yes|Group:\s*Need to Order)/i.test(item.notes ?? '')) return 'need_to_order';
  if (item.category === 'Used Spas') return 'used';
  if (item.brand === 'Sundance Spas') return 'sundance';
  if (item.brand === 'Master Spas') return 'master';
  if (item.brand === 'Platinum Spas') return 'platinum';
  if (item.brand === 'Eco Spas') return 'eco';
  if (item.category === 'Saunas') return 'saunas';
  if (item.category === 'Outdoor Living') return 'outdoor';
  if (item.category === 'Covers') return 'covers';
  return 'other';
}

function compareSourceOrder(a: InventoryGroupingItem, b: InventoryGroupingItem) {
  const aSource = inventorySourcePosition(a.notes);
  const bSource = inventorySourcePosition(b.notes);
  if (aSource && bSource) {
    const sheetDifference = (SHEET_ORDER[aSource.sheet] ?? 99) - (SHEET_ORDER[bSource.sheet] ?? 99);
    if (sheetDifference !== 0) return sheetDifference;
    if (aSource.row !== bSource.row) return aSource.row - bSource.row;
    if (aSource.unit !== bSource.unit) return aSource.unit - bSource.unit;
  } else if (aSource || bSource) {
    return aSource ? -1 : 1;
  }
  const createdDifference = (a.created_at ?? '').localeCompare(b.created_at ?? '');
  return createdDifference !== 0 ? createdDifference : a.id.localeCompare(b.id);
}

export function groupInventoryItems<T extends InventoryGroupingItem>(items: T[]): InventoryGroup<T>[] {
  const grouped = new Map<InventoryGroupKey, T[]>();
  for (const item of items) {
    const key = inventoryGroupKey(item);
    const groupItems = grouped.get(key) ?? [];
    groupItems.push(item);
    grouped.set(key, groupItems);
  }
  return GROUP_ORDER.flatMap((key) => {
    const groupItems = grouped.get(key);
    if (!groupItems?.length) return [];
    return [{ ...GROUPS[key], items: [...groupItems].sort(compareSourceOrder) } as InventoryGroup<T>];
  });
}
