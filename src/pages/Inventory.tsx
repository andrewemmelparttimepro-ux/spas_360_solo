import { Search, Plus, Package, ArrowRightLeft, X, Check, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import StoreSwitcher from '@/components/StoreSwitcher';
import InventoryEditor from '@/components/InventoryEditor';
import type { InventoryItem } from '@/types/database';
import { cn } from '@/lib/utils';
import {
  joinSerialAndFlooring,
  serialNumberForDisplay,
  splitSerialAndFlooring,
} from '@/lib/inventoryFields';

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
  type?: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  prefix?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const requiresExplicitCommit = type === 'date' || type === 'select';

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  // Sync external value changes (realtime updates)
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);

  const commit = async () => {
    const submittedValue = inputRef.current?.value ?? draft;
    setDraft(submittedValue);
    if (submittedValue === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    setSaveError(null);
    const parsed = type === 'number' ? (submittedValue ? parseFloat(submittedValue) : null) : submittedValue;
    try {
      const saved = await onSave(itemId, { [field]: parsed } as Partial<InventoryItem>);
      if (saved) {
        setEditing(false);
        return;
      }
      setSaveError('Could not save. Try again.');
    } catch {
      setSaveError('Could not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(String(value ?? ''));
    setSaveError(null);
    setEditing(false);
  };

  if (editing) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        <span className="inline-flex items-center gap-1">
          {type === 'select' ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={draft}
              onChange={e => { setDraft(e.target.value); setSaveError(null); }}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
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
              onChange={e => { setDraft(e.target.value); setSaveError(null); }}
              onBlur={requiresExplicitCommit ? undefined : commit}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
              disabled={saving}
              className={cn("px-2 py-1 border border-brand-500 rounded-lg text-xs outline-none focus:ring-2 focus:ring-brand-500/30 w-full max-w-[160px]", type === 'number' && 'text-right max-w-[100px]')}
            />
          )}
          {requiresExplicitCommit && (
            <>
              <button
                type="button"
                onClick={commit}
                disabled={saving}
                aria-label={`Save ${field}`}
                title="Save"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={saving}
                aria-label={`Cancel ${field}`}
                title="Cancel"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-ink-700 text-ink-400 hover:bg-ink-800 disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
        {saveError && <span role="alert" className="text-[11px] font-medium text-red-400">{saveError}</span>}
      </span>
    );
  }

  const display = value != null && value !== '' && value !== 0
    ? (prefix ? `${prefix}${Number(value).toLocaleString()}` : String(value))
    : (type === 'number' ? '$0' : '—');

  return (
    <span
      onClick={() => { setSaveError(null); setEditing(true); }}
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

const importedCustomerOrStock = (item: InventoryItem) => {
  const importedCustomer = item.notes?.match(/(?:^|·)\s*Customer:\s*(.*?)(?=\s*·|$)/i)?.[1]?.trim();
  if (importedCustomer) {
    return importedCustomer.toUpperCase() === 'STOCK' ? 'Stock' : importedCustomer;
  }
  return item.customer_id ? 'Customer' : 'Stock';
};

function InventoryTextCell({
  item,
  part,
  onSave,
}: {
  item: InventoryItem;
  part: 'serial' | 'flooring';
  onSave: (id: string, updates: Partial<InventoryItem>) => Promise<boolean>;
}) {
  const parsed = splitSerialAndFlooring(item.sku);
  const handleSave = (id: string, updates: Partial<InventoryItem>) => {
    const nextValue = String((updates as Record<string, unknown>)[part] ?? '');
    return onSave(id, {
      sku: joinSerialAndFlooring(
        part === 'serial' ? nextValue : parsed.serial,
        part === 'flooring' ? nextValue : parsed.flooring,
      ),
    });
  };

  const displayValue = part === 'serial'
    ? serialNumberForDisplay(parsed.serial)
    : parsed.flooring;

  return <EditableCell value={displayValue} field={part} itemId={item.id} onSave={handleSave} />;
}

function OnHandCell({
  item,
  onSave,
}: {
  item: InventoryItem;
  onSave: (id: string, updates: Partial<InventoryItem>) => Promise<boolean>;
}) {
  const value = item.status === 'In Stock' || item.status === 'Sold' ? 'Yes' : 'No';
  const handleSave = (id: string, updates: Partial<InventoryItem>) => {
    const nextValue = (updates as Record<string, unknown>).on_hand === 'Yes';
    return onSave(id, {
      status: nextValue ? 'In Stock' : 'On Order',
    } as Partial<InventoryItem>);
  };

  return <EditableCell value={value} field="on_hand" itemId={item.id} onSave={handleSave} type="select" options={['Yes', 'No']} />;
}

// --------------- Category options ---------------
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
          <table className="w-full min-w-[1120px] text-left border-collapse">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-900 sticky top-0">
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Model</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Color Combination</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Serial Number</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Inventory Flooring Status</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Customer/Stock</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">Delivery Date</th>
                <th className="p-4 text-xs font-semibold text-ink-400 uppercase tracking-wider">On Hand Y/N</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {visibleItems.length === 0 ? (
                <tr><td colSpan={7} className="p-8 text-center text-ink-500">No inventory items found</td></tr>
              ) : visibleItems.map(item => (
                <tr key={item.id} onDoubleClick={() => setEditorTarget(item)} className="hover:bg-ink-800/60 transition-colors">
                  <td className="p-4 text-sm text-ink-300">
                    <Link to={`/inventory/${item.id}`} className="text-brand-400 hover:text-brand-300 hover:underline">
                      {item.model || item.product}
                    </Link>
                  </td>
                  <td className="p-4 text-sm text-ink-400">
                    <EditableCell value={item.color_finish} field="color_finish" itemId={item.id} onSave={updateItem} />
                  </td>
                  <td className="p-4 text-sm text-ink-300">
                    <InventoryTextCell item={item} part="serial" onSave={updateItem} />
                  </td>
                  <td className="p-4 text-sm text-ink-300">
                    <InventoryTextCell item={item} part="flooring" onSave={updateItem} />
                  </td>
                  <td className="p-4 text-sm text-ink-300">{importedCustomerOrStock(item)}</td>
                  <td className="p-4 text-sm text-ink-300">
                    <EditableCell value={item.date_delivered} field="date_delivered" itemId={item.id} onSave={updateItem} type="date" />
                  </td>
                  <td className="p-4 text-sm font-semibold text-ink-200">
                    <OnHandCell item={item} onSave={updateItem} />
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
