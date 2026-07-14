import { useState, useMemo, useEffect } from 'react';
import { X, Trash2, BadgeDollarSign, Package, ImagePlus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useContacts } from '@/hooks/useContacts';
import { useToast } from '@/components/ui/Toast';
import type { InventoryItem } from '@/types/database';
import { supabase } from '@/lib/supabase';

/**
 * Inventory editor — slide-over drawer, create + edit. Same guided-clicks
 * language as the customer wizard: chips for everything choosable, smart
 * defaults (your store, In Stock, received today), live margin math, a
 * Mark Sold flow that links the actual customer, and a two-step delete
 * (managers only — mirrors the RLS policy).
 */

const CATEGORIES = ['Hot Tubs', 'Swim Spas', 'Saunas', 'Cold Plunges', 'Game Room', 'Covers', 'Chemicals', 'Parts', 'Accessories'];
const BRANDS = ['Sundance', 'Master Spas', 'Finnleo', 'Hot Spring', 'Eco Spa', 'Covana', 'Visscher'];
const STATUSES = ['In Stock', 'On Order', 'In Transit', 'Sold', 'Delivered', 'Returned'] as const;

const statusChip: Record<string, string> = {
  'In Stock': 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300',
  'On Order': 'bg-purple-500/15 border-purple-500/50 text-purple-300',
  'In Transit': 'bg-brand-500/15 border-brand-500/50 text-brand-300',
  'Sold': 'bg-amber-500/15 border-amber-500/50 text-amber-300',
  'Delivered': 'bg-ink-800 border-ink-600 text-ink-300',
  'Returned': 'bg-red-500/15 border-red-500/50 text-red-300',
};

const inputClass = 'w-full px-3 py-2 bg-ink-950 border border-ink-700 rounded-lg text-sm text-ink-100 placeholder-ink-500 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 transition-all';
const labelClass = 'block text-[10px] font-bold uppercase tracking-wider text-ink-500 mb-1.5';

function Chip({ active, onClick, children, tone }: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-full text-xs font-semibold border transition-all',
        active
          ? tone ?? 'bg-brand-500/15 border-brand-500 text-brand-300'
          : 'bg-ink-950 border-ink-700 text-ink-400 hover:border-ink-600 hover:text-ink-300'
      )}
    >
      {children}
    </button>
  );
}

interface Props {
  item?: InventoryItem | null; // null/undefined = create mode
  onClose: () => void;
  onSave: (values: Partial<InventoryItem>, id?: string) => Promise<boolean>;
  onDelete?: (id: string) => Promise<boolean>;
}

export default function InventoryEditor({ item, onClose, onSave, onDelete }: Props) {
  const { profile, locations, activeLocationId } = useAuth();
  const { contacts } = useContacts();
  const { toast } = useToast();
  const isEdit = !!item;
  const isManager = profile?.role === 'owner_manager' || profile?.role === 'service_manager';

  const today = new Date().toISOString().split('T')[0];
  const [v, setV] = useState({
    sku: item?.sku ?? '',
    product: item?.product ?? '',
    brand: item?.brand ?? '',
    category: item?.category ?? 'Hot Tubs',
    model: item?.model ?? '',
    color_finish: item?.color_finish ?? '',
    status: item?.status ?? 'In Stock',
    // Smart defaults: the store you're in, received today
    location_id: item?.location_id ?? activeLocationId ?? profile?.location_id ?? locations[0]?.id ?? '',
    cost: item?.cost != null ? String(item.cost) : '',
    msrp: item?.msrp != null ? String(item.msrp) : '',
    sale_price: item?.sale_price != null ? String(item.sale_price) : '',
    customer_id: item?.customer_id ?? '',
    date_received: item?.date_received ?? (item ? '' : today),
    date_sold: item?.date_sold ?? '',
    warranty_info: item?.warranty_info ?? '',
    notes: item?.notes ?? '',
    primary_image_storage_path: item?.primary_image_storage_path ?? '',
    primary_image_mime_type: item?.primary_image_mime_type ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch: Partial<typeof v>) => setV(prev => ({ ...prev, ...patch }));

  useEffect(() => {
    if (!v.primary_image_storage_path) { setPhotoPreview(null); return; }
    supabase.storage.from('ari-assets').createSignedUrl(v.primary_image_storage_path, 3600)
      .then(({ data }) => setPhotoPreview(data?.signedUrl ?? null));
  }, [v.primary_image_storage_path]);

  const uploadProductPhoto = async (file: File) => {
    if (!profile || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast('Use a JPG, PNG, or WebP product photo', 'error');
      return;
    }
    setUploadingPhoto(true);
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${profile.org_id}/inventory/${item?.id ?? 'staged'}/${crypto.randomUUID()}.${extension}`;
    const { error } = await supabase.storage.from('ari-assets').upload(path, file, { contentType: file.type, upsert: false });
    setUploadingPhoto(false);
    if (error) { toast(`Photo upload failed: ${error.message}`, 'error'); return; }
    set({ primary_image_storage_path: path, primary_image_mime_type: file.type });
    setPhotoPreview(URL.createObjectURL(file));
    toast('Approved product photo attached', 'success');
  };

  // Live margin — the number Brandon actually cares about
  const margin = useMemo(() => {
    const cost = parseFloat(v.cost), sale = parseFloat(v.sale_price);
    if (isNaN(cost) || isNaN(sale) || sale === 0) return null;
    const dollars = sale - cost;
    return { dollars, pct: Math.round((dollars / sale) * 100) };
  }, [v.cost, v.sale_price]);

  const markSold = () => set({ status: 'Sold', date_sold: v.date_sold || today });

  const handleSave = async () => {
    if (!v.sku.trim() || !v.product.trim() || !v.location_id) return;
    setSaving(true);
    const payload: Partial<InventoryItem> = {
      sku: v.sku.trim(),
      product: v.product.trim(),
      brand: v.brand.trim() || null,
      category: v.category,
      model: v.model.trim() || null,
      color_finish: v.color_finish.trim() || null,
      status: v.status as InventoryItem['status'],
      location_id: v.location_id,
      cost: v.cost ? parseFloat(v.cost) : null,
      msrp: v.msrp ? parseFloat(v.msrp) : null,
      sale_price: v.sale_price ? parseFloat(v.sale_price) : null,
      customer_id: v.customer_id || null,
      date_received: v.date_received || null,
      date_sold: v.date_sold || null,
      warranty_info: v.warranty_info.trim() || null,
      notes: v.notes.trim() || null,
      primary_image_storage_path: v.primary_image_storage_path || null,
      primary_image_mime_type: v.primary_image_mime_type || null,
    };
    const ok = await onSave(payload, item?.id);
    setSaving(false);
    if (ok) {
      toast(isEdit ? `${v.product} updated` : `${v.product} added to inventory`, 'success');
      onClose();
    } else {
      toast('Save failed — check required fields', 'error');
    }
  };

  const handleDelete = async () => {
    if (!item || !onDelete) return;
    const ok = await onDelete(item.id);
    if (ok) { toast(`${item.product} removed from inventory`, 'success'); onClose(); }
    else toast('Delete failed', 'error');
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full sm:w-[440px] h-full bg-ink-900 border-l border-ink-700 shadow-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-ink-700 flex items-start justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="p-2 rounded-[10px] bg-brand-500/15 shrink-0"><Package className="w-4 h-4 text-brand-400" /></span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-bold text-ink-100 truncate">{isEdit ? v.product || 'Edit Unit' : 'Add Inventory'}</h2>
              <p className="text-[11px] text-ink-500">{isEdit ? `SKU ${item!.sku}` : 'Defaults set — change what differs'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-ink-500 hover:text-ink-300 shrink-0" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>SKU / Serial *</label><input value={v.sku} onChange={e => set({ sku: e.target.value })} className={inputClass} placeholder="101039194" /></div>
            <div><label className={labelClass}>Model</label><input value={v.model} onChange={e => set({ model: e.target.value })} className={inputClass} /></div>
          </div>
          <div><label className={labelClass}>Product *</label><input value={v.product} onChange={e => set({ product: e.target.value })} className={inputClass} placeholder="Nova 7L" /></div>
          <div><label className={labelClass}>Color / Finish</label><input value={v.color_finish} onChange={e => set({ color_finish: e.target.value })} className={inputClass} placeholder="Grey/Platinum" /></div>

          <div>
            <label className={labelClass}>Approved product photo</label>
            <label className="group flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-ink-600 bg-ink-950 p-3 transition-colors hover:border-brand-500/60 hover:bg-brand-500/5">
              {photoPreview ? (
                <img src={photoPreview} alt="Approved inventory" className="h-16 w-20 rounded-lg object-cover" />
              ) : (
                <span className="flex h-16 w-20 items-center justify-center rounded-lg bg-ink-800 text-ink-500"><ImagePlus className="h-6 w-6" /></span>
              )}
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold text-ink-200">{photoPreview ? 'Replace product photo' : 'Attach product photo'}</span>
                <span className="mt-1 block text-[10px] text-ink-500">Used by Ari in verified one-pagers and sales PDFs.</span>
              </span>
              {uploadingPhoto && <Loader2 className="h-4 w-4 animate-spin text-brand-400" />}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={uploadingPhoto}
                onChange={event => { const file = event.target.files?.[0]; if (file) uploadProductPhoto(file); event.currentTarget.value = ''; }}
              />
            </label>
          </div>

          {/* Brand chips + free text */}
          <div>
            <label className={labelClass}>Brand</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {BRANDS.map(b => <Chip key={b} active={v.brand === b} onClick={() => set({ brand: v.brand === b ? '' : b })}>{b}</Chip>)}
            </div>
            <input value={BRANDS.includes(v.brand) ? '' : v.brand} onChange={e => set({ brand: e.target.value })} className={cn(inputClass, 'max-w-[220px]')} placeholder="Other brand…" />
          </div>

          {/* Category chips */}
          <div>
            <label className={labelClass}>Category</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => <Chip key={c} active={v.category === c} onClick={() => set({ category: c })}>{c}</Chip>)}
            </div>
          </div>

          {/* Store */}
          <div>
            <label className={labelClass}>Store</label>
            <div className="flex gap-1.5">
              {locations.map(l => <Chip key={l.id} active={v.location_id === l.id} onClick={() => set({ location_id: l.id })}>{l.name}</Chip>)}
            </div>
          </div>

          {/* Status chips (colored like the floor) */}
          <div>
            <label className={labelClass}>Status</label>
            <div className="flex flex-wrap gap-1.5">
              {STATUSES.map(st => (
                <Chip key={st} active={v.status === st} onClick={() => set({ status: st })} tone={statusChip[st]}>{st}</Chip>
              ))}
            </div>
          </div>

          {/* Sold → link the actual customer */}
          {v.status === 'Sold' && (
            <div className="p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/20 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-amber-300">Sold — link the customer</p>
              <select value={v.customer_id} onChange={e => set({ customer_id: e.target.value })} className={inputClass}>
                <option value="">Select customer…</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} — {c.phone}</option>)}
              </select>
              <div><label className={labelClass}>Date sold</label><input type="date" value={v.date_sold} onChange={e => set({ date_sold: e.target.value })} className={inputClass} /></div>
            </div>
          )}

          {/* Pricing + live margin */}
          <div>
            <label className={labelClass}>Pricing</label>
            <div className="grid grid-cols-3 gap-2.5">
              <div><input type="number" value={v.cost} onChange={e => set({ cost: e.target.value })} className={inputClass} placeholder="Cost $" /></div>
              <div><input type="number" value={v.msrp} onChange={e => set({ msrp: e.target.value })} className={inputClass} placeholder="MSRP $" /></div>
              <div><input type="number" value={v.sale_price} onChange={e => set({ sale_price: e.target.value })} className={inputClass} placeholder="Sale $" /></div>
            </div>
            {margin && (
              <p className={cn('flex items-center gap-1.5 text-xs font-semibold mt-2', margin.dollars >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                <BadgeDollarSign className="w-3.5 h-3.5" />
                Margin {margin.dollars < 0 ? '−' : ''}${Math.abs(margin.dollars).toLocaleString()} · {margin.pct}%
              </p>
            )}
          </div>

          {/* Dates + warranty */}
          <div className="grid grid-cols-2 gap-3">
            <div><label className={labelClass}>Date received</label><input type="date" value={v.date_received} onChange={e => set({ date_received: e.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Warranty</label><input value={v.warranty_info} onChange={e => set({ warranty_info: e.target.value })} className={inputClass} placeholder="5yr shell / 2yr parts" /></div>
          </div>

          <div><label className={labelClass}>Notes</label><textarea value={v.notes} onChange={e => set({ notes: e.target.value })} rows={3} className={cn(inputClass, 'resize-none')} placeholder="Size, cover, order refs…" /></div>

          {/* Danger zone — managers only, two-step */}
          {isEdit && isManager && onDelete && (
            <div className="pt-2 border-t border-ink-800">
              {confirmDelete ? (
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <span className="text-xs text-red-300 font-medium">Remove this unit permanently?</span>
                  <span className="flex gap-2 shrink-0">
                    <button onClick={() => setConfirmDelete(false)} className="text-xs font-semibold text-ink-300 hover:text-ink-100 px-2 py-1">Keep</button>
                    <button onClick={handleDelete} className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1 rounded-md">Delete</button>
                  </span>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(true)} className="flex items-center gap-1.5 text-xs font-semibold text-red-400/80 hover:text-red-400">
                  <Trash2 className="w-3.5 h-3.5" />Remove from inventory
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-ink-700 flex items-center justify-between gap-3 shrink-0">
          {isEdit && v.status !== 'Sold' ? (
            <button onClick={markSold} className="text-xs font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 px-3 py-2 rounded-lg transition-colors">
              Mark Sold
            </button>
          ) : <span />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-ink-300 hover:bg-ink-800 rounded-lg transition-colors">Cancel</button>
            <button
              onClick={handleSave}
              disabled={!v.sku.trim() || !v.product.trim() || !v.location_id || saving}
              className="px-5 py-2 text-sm bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors"
            >
              {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add to Inventory'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
