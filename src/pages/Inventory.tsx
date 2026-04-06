import { Search, Filter, Plus, Package, ArrowRightLeft, X, Check, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useRef, useEffect } from 'react';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
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
        className="px-2 py-1 border border-sky-400 rounded-lg text-xs outline-none bg-white min-w-[100px] focus:ring-2 focus:ring-sky-200"
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
        className={cn("px-2 py-1 border border-sky-400 rounded-lg text-xs outline-none focus:ring-2 focus:ring-sky-200 w-full max-w-[160px]", type === 'number' && 'text-right max-w-[100px]')}
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
        "cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 group inline-flex items-center gap-1",
        className
      )}
      title="Click to edit"
    >
      {display}
      <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </span>
  );
}

// --------------- Status badge (editable) ---------------
const STATUS_OPTIONS: InventoryStatus[] = ['In Stock', 'On Order', 'In Transit', 'Sold', 'Delivered', 'Returned'];
const STATUS_COLORS: Record<string, string> = {
  'In Stock': 'bg-emerald-100 text-emerald-800',
  'Sold': 'bg-amber-100 text-amber-800',
  'On Order': 'bg-blue-100 text-blue-800',
  'In Transit': 'bg-purple-100 text-purple-800',
  'Delivered': 'bg-slate-100 text-slate-600',
  'Returned': 'bg-red-100 text-red-800',
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
        className="px-2 py-1 border border-sky-400 rounded-lg text-xs outline-none bg-white focus:ring-2 focus:ring-sky-200"
      >
        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-sky-200 transition-all group gap-1",
        STATUS_COLORS[value] ?? 'bg-slate-100 text-slate-800'
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

// =============== Main page component ===============
export default function Inventory() {
  const { items, isLoading, searchQuery, setSearchQuery, totalInStock, awaitingDelivery, onOrder, lowStockAlerts, createItem, updateItem } = useInventory();
  const { locations } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [newItem, setNewItem] = useState({
    sku: '', product: '', brand: '', category: 'Hot Tubs',
    model: '', color_finish: '', status: 'In Stock' as InventoryStatus,
    cost: '', msrp: '', sale_price: '', location_id: '',
 notes: '',
  });

  const handleCreate = async () => {
    await createItem({
      sku: newItem.sku,
      product: newItem.product,
      brand: newItem.brand || null,
      category: newItem.category,
      model: newItem.model || null,
      color_finish: newItem.color_finish || null,
      status: newItem.status,
      cost: newItem.cost ? parseFloat(newItem.cost) : null,
      msrp: newItem.msrp ? parseFloat(newItem.msrp) : null,
      sale_price: newItem.sale_price ? parseFloat(newItem.sale_price) : null,
      location_id: newItem.location_id || (locations[0]?.id ?? ''),
      notes: newItem.notes || null,
    });
    setShowCreate(false);
    setNewItem({ sku: '', product: '', brand: '', category: 'Hot Tubs', model: '', color_finish: '', status: 'In Stock', cost: '', msrp: '', sale_price: '', location_id: '', notes: '' });
  };

  const summaryCards = [
    { label: 'Total Units in Stock', value: totalInStock, color: 'bg-blue-100 text-blue-600' },
    { label: 'Sold (Awaiting Delivery)', value: awaitingDelivery, color: 'bg-amber-100 text-amber-600' },
    { label: 'On Order', value: onOrder, color: 'bg-purple-100 text-purple-600' },
    { label: 'Low Stock Alerts', value: lowStockAlerts, color: 'bg-red-100 text-red-600' },
  ];

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-1">Track units, parts, and chemicals across locations &mdash; click any cell to edit</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><ArrowRightLeft className="w-4 h-4 mr-2" />Transfer</button>
          <button onClick={() => setShowCreate(true)} className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Plus className="w-4 h-4 mr-2" />Add Item</button>
        </div>
      </div>

      {/* Add Item Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">Add Inventory Item</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="SKU *" value={newItem.sku} onChange={e => setNewItem({...newItem, sku: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
                <input placeholder="Product Name *" value={newItem.product} onChange={e => setNewItem({...newItem, product: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Brand" value={newItem.brand} onChange={e => setNewItem({...newItem, brand: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
                <select value={newItem.category} onChange={e => setNewItem({...newItem, category: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Model" value={newItem.model} onChange={e => setNewItem({...newItem, model: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
                <input placeholder="Color / Finish" value={newItem.color_finish} onChange={e => setNewItem({...newItem, color_finish: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={newItem.status} onChange={e => setNewItem({...newItem, status: e.target.value as InventoryStatus})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
                </select>
                <select value={newItem.location_id} onChange={e => setNewItem({...newItem, location_id: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="">Location *</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input placeholder="Cost ($)" type="number" value={newItem.cost} onChange={e => setNewItem({...newItem, cost: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
                <input placeholder="MSRP ($)" type="number" value={newItem.msrp} onChange={e => setNewItem({...newItem, msrp: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
                <input placeholder="Sale Price ($)" type="number" value={newItem.sale_price} onChange={e => setNewItem({...newItem, sale_price: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              </div>
              <textarea placeholder="Notes" value={newItem.notes} onChange={e => setNewItem({...newItem, notes: e.target.value})} rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400 resize-none" />
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newItem.sku || !newItem.product || !newItem.location_id} className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:opacity-50">Add Item</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 shrink-0">
        {summaryCards.map(card => (
          <div key={card.label} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center">
            <div className={`p-3 rounded-lg mr-4 ${card.color}`}><Package className="w-6 h-6" /></div>
            <div><p className="text-sm font-medium text-slate-500">{card.label}</p><p className="text-2xl font-bold text-slate-900">{card.value}</p></div>
          </div>
        ))}
      </div>

      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search SKU, product, category..." className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-sky-400 focus:ring-1 focus:ring-sky-400 outline-none" />
          </div>
          <button className="flex items-center text-sm font-medium text-slate-600 hover:text-slate-900"><Filter className="w-4 h-4 mr-2" />More Filters</button>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-white sticky top-0">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.length === 0 ? (
                <tr><td colSpan={5} className="p-8 text-center text-slate-400">No inventory items found</td></tr>
              ) : items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="p-4 text-sm font-medium">
                    <Link to={`/inventory/${item.id}`} className="text-sky-600 hover:text-sky-900 hover:underline">{item.sku}</Link>
                  </td>
                  <td className="p-4 text-sm text-slate-700">
                    <EditableCell value={item.product} field="product" itemId={item.id} onSave={updateItem} />
                  </td>
                  <td className="p-4 text-sm text-slate-500">
                    <EditableCell value={item.category} field="category" itemId={item.id} onSave={updateItem} type="select" options={CATEGORY_OPTIONS} />
                  </td>
                  <td className="p-4">
                    <EditableStatus value={item.status} itemId={item.id} onSave={updateItem} />
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-900 text-right">
                    <EditableCell value={item.sale_price ?? item.msrp ?? 0} field="sale_price" itemId={item.id} onSave={updateItem} type="number" prefix="$" className="justify-end" />
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
