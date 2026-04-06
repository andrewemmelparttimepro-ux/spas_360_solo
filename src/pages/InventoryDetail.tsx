import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Pencil } from 'lucide-react';
import { useEffect, useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { InventoryItem, InventoryStatus } from '@/types/database';

const STATUS_OPTIONS: InventoryStatus[] = ['In Stock', 'On Order', 'In Transit', 'Sold', 'Delivered', 'Returned'];
const STATUS_COLORS: Record<string, string> = {
  'In Stock': 'bg-emerald-100 text-emerald-800', 'Sold': 'bg-amber-100 text-amber-800',
  'On Order': 'bg-blue-100 text-blue-800', 'In Transit': 'bg-purple-100 text-purple-800',
  'Delivered': 'bg-slate-100 text-slate-600', 'Returned': 'bg-red-100 text-red-800',
};
const CATEGORY_OPTIONS = ['Hot Tubs', 'Swim Spas', 'Saunas', 'Cold Plunges', 'Chemicals', 'Parts', 'Accessories', 'Covers'];

// --------------- Inline editable field for detail view ---------------
function EditableField({
  label, value, field, itemId, onSave,
  type = 'text', options, prefix, bold, color, multiline,
}: {
  label: string; value: string | number | null; field: string; itemId: string;
  onSave: (id: string, u: Partial<InventoryItem>) => Promise<boolean>;
  type?: 'text' | 'number' | 'select'; options?: string[];
  prefix?: string; bold?: boolean; color?: string; multiline?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value ?? ''));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { if (!editing) setDraft(String(value ?? '')); }, [value, editing]);

  const commit = async () => {
    if (draft === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    const parsed = type === 'number' ? (draft ? parseFloat(draft) : null) : (draft || null);
    await onSave(itemId, { [field]: parsed } as Partial<InventoryItem>);
    setSaving(false);
    setEditing(false);
  };

  const cancel = () => { setDraft(String(value ?? '')); setEditing(false); };

  const display = value != null && value !== ''
    ? (prefix ? `${prefix}${Number(value).toLocaleString()}` : String(value))
    : 'â';

  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {editing ? (
        type === 'select' ? (
          <select
            ref={inputRef as React.RefObject<HTMLSelectElement>}
            value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
            disabled={saving}
            className="px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200 w-full"
          >
            {options?.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : multiline ? (
          <textarea
            ref={inputRef as React.RefObject<HTMLTextAreaElement>}
            value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') cancel(); }}
            disabled={saving} rows={3}
            className="px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200 w-full resize-none"
          />
        ) : (
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type={type} value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit}
            onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
            disabled={saving}
            className="px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200 w-full"
          />
        )
      ) : (
        <p
          onClick={() => setEditing(true)}
          className={cn(
            "text-sm cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 hover:bg-sky-50 hover:ring-1 hover:ring-sky-200 transition-colors group inline-flex items-center gap-1",
            bold && 'font-bold', color
          )}
          title="Click to edit"
        >
          {display}
          <Pencil className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </p>
      )}
    </div>
  );
}

// =============== Main detail component ===============
export default function InventoryDetail() {
  const { id } = useParams();
  const { locations } = useAuth();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchItem = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase.from('inventory_items').select('*, locations:location_id(name)').eq('id', id).single();
    setItem(data as InventoryItem);
    setIsLoading(false);
  }, [id]);

  useEffect(() => { fetchItem(); }, [fetchItem]);

  // Real-time: re-fetch when this item changes
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`inventory-detail-${id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'inventory_items',
        filter: `id=eq.${id}`,
      }, () => fetchItem())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, fetchItem]);

  const handleSave = useCallback(async (itemId: string, updates: Partial<InventoryItem>) => {
    const { error } = await supabase.from('inventory_items').update(updates).eq('id', itemId);
    if (error) { console.error('Error updating:', error); return false; }
    await fetchItem();
    return true;
  }, [fetchItem]);

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  if (!item) return <div className="text-center text-slate-400"><p>Item not found</p><Link to="/inventory" className="text-sky-500 text-sm mt-2 hover:underline">Back</Link></div>;

  const loc = (item as Record<string, unknown>).locations as { name: string } | undefined;

  // Editable status badge
  const StatusBadge = () => {
    const [editing, setEditing] = useState(false);
    const ref = useRef<HTMLSelectElement>(null);
    useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);

    if (editing) {
      return (
        <select
          ref={ref} value={item.status}
          onChange={async e => { await handleSave(item.id, { status: e.target.value as InventoryStatus }); setEditing(false); }}
          onBlur={() => setEditing(false)}
          className="px-2 py-1 border border-sky-400 rounded-lg text-sm outline-none bg-white focus:ring-2 focus:ring-sky-200"
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      );
    }
    return (
      <span
        onClick={() => setEditing(true)}
        className={cn("px-3 py-1 rounded-full text-sm font-medium cursor-pointer hover:ring-2 hover:ring-sky-200 transition-all group inline-flex items-center gap-1", STATUS_COLORS[item.status] ?? 'bg-slate-100')}
        title="Click to change status"
      >
        {item.status}
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
      </span>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/inventory" className="p-2 hover:bg-slate-100 rounded-lg"><ArrowLeft className="w-5 h-5 text-slate-500" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{item.product}</h1>
          <p className="text-sm text-slate-500">SKU: {item.sku}</p>
        </div>
        <StatusBadge />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider">Details</h2>
          <span className="text-[10px] text-slate-400">Click any value to edit</span>
        </div>
        <div className="grid grid-cols-2 gap-6">
          <EditableField label="Brand" value={item.brand} field="brand" itemId={item.id} onSave={handleSave} />
          <EditableField label="Category" value={item.category} field="category" itemId={item.id} onSave={handleSave} type="select" options={CATEGORY_OPTIONS} />
          <EditableField label="Model" value={item.model} field="model" itemId={item.id} onSave={handleSave} />
          <EditableField label="Color/Finish" value={item.color_finish} field="color_finish" itemId={item.id} onSave={handleSave} />
          <EditableField label="Location" value={loc?.name ?? 'â'} field="location_id" itemId={item.id} onSave={handleSave} type="select" options={locations.map(l => l.name)} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Pricing</h2>
        <div className="grid grid-cols-3 gap-6">
          <EditableField label="Cost" value={item.cost} field="cost" itemId={item.id} onSave={handleSave} type="number" prefix="$" />
          <EditableField label="MSRP" value={item.msrp} field="msrp" itemId={item.id} onSave={handleSave} type="number" prefix="$" />
          <EditableField label="Sale Price" value={item.sale_price} field="sale_price" itemId={item.id} onSave={handleSave} type="number" prefix="$" bold color="text-emerald-700" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wider mb-4">Additional Info</h2>
        <div className="grid grid-cols-1 gap-6">
          <EditableField label="Warranty" value={item.warranty_info} field="warranty_info" itemId={item.id} onSave={handleSave} multiline />
          <EditableField label="Notes" value={item.notes} field="notes" itemId={item.id} onSave={handleSave} multiline />
        </div>
      </div>
    </div>
  );
}
