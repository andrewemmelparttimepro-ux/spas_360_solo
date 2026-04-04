import { useParams, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { InventoryItem } from '@/types/database';

export default function InventoryDetail() {
  const { id } = useParams();
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    supabase.from('inventory_items').select('*, locations:location_id(name)').eq('id', id).single()
      .then(({ data }) => { setItem(data as InventoryItem); setIsLoading(false); });
  }, [id]);

  if (isLoading) return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-cyan-500 rounded-full animate-spin" /></div>;
  if (!item) return <div className="text-center text-slate-400"><p>Item not found</p><Link to="/inventory" className="text-cyan-600 text-sm mt-2 hover:underline">Back</Link></div>;

  const loc = (item as Record<string, unknown>).locations as { name: string } | undefined;
  const statusColor: Record<string, string> = {
    'In Stock': 'bg-emerald-100 text-emerald-800', 'Sold': 'bg-amber-100 text-amber-800',
    'On Order': 'bg-blue-100 text-blue-800', 'In Transit': 'bg-purple-100 text-purple-800',
    'Delivered': 'bg-slate-100 text-slate-600', 'Returned': 'bg-red-100 text-red-800',
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center space-x-4">
        <Link to="/inventory" className="p-2 hover:bg-slate-100 rounded-lg"><ArrowLeft className="w-5 h-5 text-slate-500" /></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{item.product}</h1>
          <p className="text-sm text-slate-500">SKU: {item.sku}</p>
        </div>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColor[item.status] ?? 'bg-slate-100'}`}>{item.status}</span>
      </div>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 grid grid-cols-2 gap-6">
        <div><p className="text-xs text-slate-400">Brand</p><p className="text-sm font-medium">{item.brand ?? '—'}</p></div>
        <div><p className="text-xs text-slate-400">Category</p><p className="text-sm font-medium">{item.category}</p></div>
        <div><p className="text-xs text-slate-400">Model</p><p className="text-sm font-medium">{item.model ?? '—'}</p></div>
        <div><p className="text-xs text-slate-400">Color/Finish</p><p className="text-sm font-medium">{item.color_finish ?? '—'}</p></div>
        <div><p className="text-xs text-slate-400">Location</p><p className="text-sm font-medium">{loc?.name ?? '—'}</p></div>
        <div><p className="text-xs text-slate-400">Cost</p><p className="text-sm font-medium">{item.cost ? `$${item.cost.toLocaleString()}` : '—'}</p></div>
        <div><p className="text-xs text-slate-400">MSRP</p><p className="text-sm font-medium">{item.msrp ? `$${item.msrp.toLocaleString()}` : '—'}</p></div>
        <div><p className="text-xs text-slate-400">Sale Price</p><p className="text-sm font-bold text-emerald-700">{item.sale_price ? `$${item.sale_price.toLocaleString()}` : '—'}</p></div>
        {item.warranty_info && <div className="col-span-2"><p className="text-xs text-slate-400">Warranty</p><p className="text-sm">{item.warranty_info}</p></div>}
        {item.notes && <div className="col-span-2"><p className="text-xs text-slate-400">Notes</p><p className="text-sm">{item.notes}</p></div>}
      </div>
    </div>
  );
}
