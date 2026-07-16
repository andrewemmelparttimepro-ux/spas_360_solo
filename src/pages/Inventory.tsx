import { Search, Plus, Package, ArrowRightLeft, X, Check, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import StoreSwitcher from '@/components/StoreSwitcher';
import InventoryEditor from '@/components/InventoryEditor';
import type { InventoryItem, InventoryStatus } from '@/types/database';
import { cn } from '@/lib/utils';

// --------------- Inline editable cell ---------------
function EditableCell({
  value,
  field,
  itemId,
  onSave,
  type = 'text',
  options,
  prefix,
  className,
}: {
  value: string | number | null;
  field: string;
  itemId: string;
  onSave: (id: string, updates: Partial<InventoryItem>) => Promise<boolean>;
  type?: 'text' | 'number' | 'select';
  options?: string[];
  prefix?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Sync external value changes (realtime updates)
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);

  const commit = async () => {
    if (draft === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    const parsed = type === 'number' ? (draft ? parseFloat(draft) : null) : draft;
    await onSave(itemId, { [field]: parsed } as Partial<InventoryItem>);
    setSaving(false);
    setEditing(false);
  };

  const cancel = () => { setDraft(String(value ?? '')); setEditing(false); };

  if (editing) {
    return type === 'select' ? (
      <select
        ref={inputRef as React.RefObject<HTMLSelectElement>}
        value={draft}
        onChange={e => { setDraft(e.target.value); }}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
        disabled={saving}
        className="px-2 py-1 border border-brand-500 rounded-lg text-xs outline-none bg-ink-900 min-w-[100px] focus:ring-2 focus:ring-brand-500/30"
      >
        {options?.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    ) : (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={type}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
        disabled={saving}
        className={cn("px-2 py-1 border border-brand-500 rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-500/30 w-full max-w-[160px]", type === 'number' && 'text-right max-w-[100px]')}
      />
    );
  }

  const display = value != null && value !== '' && value !== 0
    ? (prefix ? `${prefix}${Number(value).toLocaleString()}` : String(value))
    : (type === 'number' ? '$0' : 'â');

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-brand-500/10 hover:ring-1 hover:ring-brand-500/30 group inline-flex items-center gap-1",
        className
      )}
      title="Click to edit"
    >
      {display}
      <Pencil className="w-3 h-3 text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </span>
  );
}

// --------------- Status badge (editable) ---------------
const STATUS_OPTIONS: InventoryStatus[] = ['In Stock', 'On Order', 'In Transit', 'Sold', 'Delivered', 'Returned'];
const STATUS_COLORS: Record<string, string> = {
  'In Stock': 'bg-emerald-500/15 text-emerald-300',
  'Sold': 'bg-amber-500/15 text-amber-300',
  'On Order': 'bg-brand-500/15 text-brand-300',
  'In Transit': 'bg-purple-500/15 text-purple-300',
  'Delivered': 'bg-ink-950 text-ink-300',
  'Returned': 'bg-red-500/15 text-red-300',
};

function EditableStatus({ value, itemId, onSave }: { value: string; itemId: string; onSave: (id: string, u: Partial<InventoryItem>) => Promise<boolean> }) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLSelectElement>(null);

  useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

  const commit = async (v: string) => {
    if (v !== value) await onSave(itemId, { status: v as InventoryStatus });
    setEditing(false);
  };

  if (editing) {
    return (
      <select
        ref={ref}
        value={value}
        onChange={e => commit(e.target.value)}
        onBlur={() => setEditing(false)}
        className="px-2 py-1 border border-brand-500 rounded-lg text-xs outline-none bg-ink-900 focus:ring-2 focus:ring-brand-500/30"
      >
        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-brand-500/30 transition-all group gap-1",
        STATUS_COLORS[value] ?? 'bg-ink-950 text-ink-100'
      )}
      title="Click to change status"
    >
      {value}
      <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
    </span>
  );
}

// --------------- Category options ---------------
const CATEGORY_OPTIONS = ['Hot Tubs', 'Swim Spas', 'Saunas', 'Cold Plunges', 'Chemicals', 'Parts', 'Accessories', 'Covers'];
const BRAND_OPTIONS = ['Sundance Spas', 'Master Spas', 'Platinum Spas', 'Eco Spas'];

// =============== Main page component ===============
export default function Inventory() {
  const { items, isLoading, searchQuery, setSearchQuery, totalInStock, awaitingDelivery, onOrder, lowStockAlerts, createItem, updateItem, deleteItem } = useInventory();
  const { locations } = useAuth();
  const [brandFilter, setBrandFilter] = useState('All Brands');
  // Editor drawer: null = closed, 'new' = create, item = edit
  const [editorTarget, setEditorTarget] = useState<'new' | InventoryItem | null>(null);

  const handleEditorSave = async (values: Partial<InventoryItem>, id?: string) => {
    if (id) return updateItem(id, values);
    return (await createItem(values)) !== null;
  };

  const summaryCards = [
    { label: 'Total Units in Stock', value: totalInStock, color: 'bg-brand-500/15 text-brand-400' },
    { label: 'Sold (Awaiting Delivery)', value: awaitingDelivery, color: 'bg-amber-500/15 text-amber-400' },
    { label: 'On Order', value: onOrder, color: 'bg-purple-500/15 text-purple-400' },
    { label: 'Low Stock Alerts', value: lowStockAlerts, color: 'bg-red-500/15 text-red-400' },
  ];
  const visibleItems = brandFilter === 'All Brands' ? items : items.filter(item => item.brand === brandFilter);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink-100 tracking-tight">Inventory Management</h1>
          <p className="hidden sm:block text-sm text-ink-400 mt-1">Track units, parts, and chemicals across locations &mdash; click any cell to edit</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-ink-900 border border-ink-700 text-ink-300 hover:bg-ink-800 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><ArrowRightLeft className="w-4 h-4 mr-2" />Transfer</button>
          <button onClick={() => setEditorTarget('new')} className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Plus className="w-4 h-4 mr-2" />Add Item</button>
        </div>
      </div>

      {editorTarget !== null && (
        <InventoryEditor
          item={editorTarget === 'new' ? null : editorTarget}
          onClose={() => setEditorTarget(null)}
          onSave={handleEditorSave}
          onDelete={deleteItem}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 shrink-0">
        {summaryCards.map(card => (
          <div key={card.label} className="bg-ink-900 p-5 rounded-xl border border-ink-700 shadow-sm flex items-center">
            <div className={`p-3 rounded-lg mr-4 ${card.color}`}><Package className="w-6 h-6" /></div>
            <div><p className="text-sm font-medium text-ink-400">{card.label}</p><p className="text-2xl font-bold text-ink-100">{card.value}</p></div>
          </div>
        ))}
      </div>

      <div className="flex-1 bg-ink-900 rounded-xl border border-ink-700 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-ink-700 flex flex-wrap items-center justify-between gap-3 bg-ink-950">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search serial number, model, category..." className="w-full pl-9 pr-4 py-2 bg-ink-900 border border-ink-700 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-ink-400">
            Brand
            <select
              value={brandFilter}
              onChange={event => setBrandFilter(event.target.value)}
              className="bg-ink-900 border border-ink-700 text-ink-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              aria-label="Filter inventory by brand"
            >
              <option>All Brands</option>
              {BRAND_OPTIONS.map(brand => <option key={brand}>{brand}</option>)}
            </select>
          </label>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-900 sticky top-0">
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Serial Number</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Model</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Category</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider text-right">Price</th>
                <th className="p-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {visibleItems.length === 0 ? (
                <tr><td colSpan={6} className="p-8 text-center text-ink-500">No inventory items found</td></tr>
              ) : visibleItems.map(item => (
                <tr key={item.id} className="hover:bg-ink-800/60 transition-colors">
                  <td className="p-4 text-sm font-medium">
                    <Link to={`/inventory/${item.id}`} className="text-brand-400 hover:text-brand-300 hover:underline">{item.sku}</Link>
                  </td>
                  <td className="p-4 text-sm text-ink-300">
                    <EditableCell value={item.product} field="product" itemId={item.id} onSave={updateItem} />
                  </td>
                  <td className="p-4 text-sm text-ink-400">
                    <EditableCell value={item.category} field="category" itemId={item.id} onSave={updateItem} type="select" options={CATEGORY_OPTIONS} />
                  </td>
                  <td className="p-4">
                    <EditableStatus value={item.status} itemId={item.id} onSave={updateItem} />
                  </td>
                  <td className="p-4 text-sm font-medium text-ink-100 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {item.msrp != null && item.sale_price != null && Number(item.msrp) > Number(item.sale_price) && (
                        <span className="text-[11px] text-ink-500 line-through shrink-0" title="MSRP">${Number(item.msrp).toLocaleString()}</span>
                      )}
                      <EditableCell value={item.sale_price ?? item.msrp ?? 0} field="sale_price" itemId={item.id} onSave={updateItem} type="number" prefix="$" className="justify-end" />
                    </div>
                  </td>
                  <td className="p-2 text-right">
                    <button
                      onClick={() => setEditorTarget(item)}
                      className="p-1.5 text-ink-500 hover:text-brand-400 hover:bg-ink-800 rounded-lg transition-colors"
                      title="Open full editor"
                      aria-label={`Edit ${item.product}`}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
