import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import type { DealInventoryOption } from '@/lib/dealInventory';
import { ALL_INVENTORY_BRANDS, inventoryMatchesBrand } from '@/lib/inventoryBrandFilter';
import { groupInventoryItems } from '@/lib/inventoryGrouping';
import { inventoryAgeLabel } from '@/lib/inventoryAge';
import { inventoryCustomerOrStock, serialNumberForDisplay, splitSerialAndFlooring } from '@/lib/inventoryFields';
import { cn } from '@/lib/utils';

const HEADER_CELL_CLASS = 'px-3 py-2 text-[11px] font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap';
const GROUP_HEADER_CELL_CLASS = 'px-3 py-1 text-left';
const ROW_CELL_CLASS = 'px-3 py-0.5 text-xs leading-4';

type DealInventorySelectorProps = {
  items: DealInventoryOption[];
  initialSelection: string;
  loading: boolean;
  busy?: boolean;
  showStore: boolean;
  title: string;
  actionLabel: string;
  onCancel: () => void;
  onConfirm: (inventoryItemId: string) => void | Promise<void>;
};

function searchableInventoryText(item: DealInventoryOption): string {
  return [item.model, item.product, item.brand, item.color_finish, item.sku, item.locations?.name]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export default function DealInventorySelector({
  items,
  initialSelection,
  loading,
  busy = false,
  showStore,
  title,
  actionLabel,
  onCancel,
  onConfirm,
}: DealInventorySelectorProps) {
  const [selectedInventoryId, setSelectedInventoryId] = useState(initialSelection);
  const [brandFilter, setBrandFilter] = useState(ALL_INVENTORY_BRANDS);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [busy, onCancel]);

  const brandOptions = useMemo(() => Array.from(new Set(
    items.map(item => item.brand?.trim()).filter((brand): brand is string => Boolean(brand)),
  )).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true })), [items]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
    return items.filter(item => (
      inventoryMatchesBrand(item, brandFilter)
      && (!normalizedQuery || searchableInventoryText(item).includes(normalizedQuery))
    ));
  }, [brandFilter, items, searchQuery]);
  const groupedItems = useMemo(() => groupInventoryItems(visibleItems), [visibleItems]);
  const columnCount = showStore ? 9 : 8;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="deal-inventory-selector-title"
        className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-500">Inventory</p>
            <h2 id="deal-inventory-selector-title" className="mt-1 text-xl font-bold text-ink-100">{title}</h2>
            <p className="mt-1 text-sm text-ink-400">Choose one available In Stock unit. The rows and color groups match Inventory.</p>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} aria-label="Close inventory window" className="rounded-lg p-2 text-ink-400 hover:bg-ink-800 disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-b border-ink-700 bg-ink-950 px-4 py-3">
          <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
            <input
              ref={searchRef}
              type="search"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder="Search model, serial number, color, store..."
              className="w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-4 text-sm text-ink-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div className="flex max-w-full items-center gap-1.5 overflow-x-auto" aria-label="Filter by make or brand">
            {[ALL_INVENTORY_BRANDS, ...brandOptions].map(brand => (
              <button
                key={brand}
                type="button"
                onClick={() => setBrandFilter(brand)}
                aria-pressed={brandFilter === brand}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  brandFilter === brand
                    ? 'border-brand-500 bg-brand-500/15 text-brand-300'
                    : 'border-ink-700 bg-ink-900 text-ink-400 hover:border-ink-600 hover:text-ink-200',
                )}
              >
                {brand === ALL_INVENTORY_BRANDS ? 'All makes' : brand}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table data-density="compact" className="w-full min-w-[1220px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-ink-900">
              <tr className="border-b border-ink-700">
                <th className={HEADER_CELL_CLASS}>Model</th>
                {showStore && <th className={HEADER_CELL_CLASS}>Store</th>}
                <th className={HEADER_CELL_CLASS}>Color Combination</th>
                <th className={HEADER_CELL_CLASS}>Serial Number</th>
                <th className={HEADER_CELL_CLASS}>Inventory Flooring Status</th>
                <th className={HEADER_CELL_CLASS}>Inventory Age</th>
                <th className={HEADER_CELL_CLASS}>Customer/Stock</th>
                <th className={HEADER_CELL_CLASS}>Delivery Date</th>
                <th className={HEADER_CELL_CLASS}>On Hand Y/N</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {loading ? (
                <tr><td colSpan={columnCount} className="p-10 text-center text-sm text-ink-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Loading available units…</td></tr>
              ) : visibleItems.length === 0 ? (
                <tr><td colSpan={columnCount} className="p-10 text-center text-sm text-ink-500">No available units match these filters.</td></tr>
              ) : groupedItems.map(group => (
                <Fragment key={group.key}>
                  <tr className={cn('border-y border-ink-700', group.headerClassName)}>
                    <th colSpan={columnCount} scope="rowgroup" className={GROUP_HEADER_CELL_CLASS}>
                      <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]">
                        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', group.dotClassName)} />
                        {group.label}
                        <span className="font-semibold tracking-normal opacity-70">{group.items.length}</span>
                      </span>
                    </th>
                  </tr>
                  {group.items.map(item => {
                    const selected = selectedInventoryId === item.id;
                    const serialAndFlooring = splitSerialAndFlooring(item.sku);
                    const currentCustomerName = item.customer
                      ? `${item.customer.first_name} ${item.customer.last_name}`.trim()
                      : null;
                    return (
                      <tr
                        key={item.id}
                        tabIndex={0}
                        aria-selected={selected}
                        onClick={() => setSelectedInventoryId(item.id)}
                        onKeyDown={event => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setSelectedInventoryId(item.id);
                          }
                        }}
                        className={cn(
                          'cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500',
                          group.tintClassName,
                          selected && 'ring-2 ring-inset ring-brand-500 bg-brand-500/10',
                        )}
                      >
                        <td className={cn(ROW_CELL_CLASS, 'font-semibold text-ink-200')}>{item.model || item.product || '—'}</td>
                        {showStore && (
                          <td className={cn(ROW_CELL_CLASS, 'text-ink-300')}>
                            <span
                              className="inline-flex whitespace-nowrap rounded-full bg-ink-950 border border-ink-700 px-2 py-0.5 text-xs font-medium"
                              title={item.locations?.name ?? undefined}
                            >
                              {(item.locations?.name ?? '—').split(' (')[0]}
                            </span>
                          </td>
                        )}
                        <td className={cn(ROW_CELL_CLASS, 'text-ink-400')}>{item.color_finish || '—'}</td>
                        <td className={cn(ROW_CELL_CLASS, 'text-ink-300')}>{serialNumberForDisplay(serialAndFlooring.serial) || '—'}</td>
                        <td className={cn(ROW_CELL_CLASS, 'text-ink-300')}>{serialAndFlooring.flooring || '—'}</td>
                        <td className={cn(ROW_CELL_CLASS, 'text-ink-300 tabular-nums whitespace-nowrap')}>{inventoryAgeLabel(item.created_at ?? '')}</td>
                        <td className={cn(ROW_CELL_CLASS, 'text-ink-300')}>{inventoryCustomerOrStock(item.notes ?? null, item.customer_id ?? null, currentCustomerName)}</td>
                        <td className={cn(ROW_CELL_CLASS, 'text-ink-300')}>{item.date_delivered || '—'}</td>
                        <td className={cn(ROW_CELL_CLASS, 'font-semibold text-ink-200')}>{item.status === 'In Stock' || item.status === 'Sold' ? 'Yes' : 'No'}</td>
                      </tr>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 bg-ink-950 px-5 py-4 sm:px-6">
          <p className="min-w-0 truncate text-xs text-ink-400">
            {selectedInventoryId
              ? `Selected: ${items.find(item => item.id === selectedInventoryId)?.model || items.find(item => item.id === selectedInventoryId)?.product || 'inventory unit'}`
              : 'Select a row to continue.'}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onCancel} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-ink-400 hover:bg-ink-800 disabled:opacity-50">Cancel</button>
            <button
              type="button"
              onClick={() => void onConfirm(selectedInventoryId)}
              disabled={!selectedInventoryId || loading || busy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {actionLabel}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
