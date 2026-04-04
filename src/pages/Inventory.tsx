import { Search, Filter, Plus, Package, ArrowRightLeft, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useInventory } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import type { InventoryStatus } from '@/types/database';

export default function Inventory() {
  const { items, isLoading, searchQuery, setSearchQuery, totalInStock, awaitingDelivery, onOrder, lowStockAlerts, createItem } = useInventory();
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
          <p className="text-sm text-slate-500 mt-1">Track units, parts, and chemicals across locations</p>
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
                  <option>Hot Tubs</option><option>Swim Spas</option><option>Saunas</option><option>Chemicals</option><option>Parts</option><option>Accessories</option><option>Covers</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Model" value={newItem.model} onChange={e => setNewItem({...newItem, model: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
                <input placeholder="Color / Finish" value={newItem.color_finish} onChange={e => setNewItem({...newItem, color_finish: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={newItem.status} onChange={e => setNewItem({...newItem, status: e.target.value as InventoryStatus})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>In Stock</option><option>On Order</option><option>In Transit</option><option>Sold</option>
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
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-sm font-medium"><Link to={`/inventory/${item.id}`} className="text-sky-600 hover:text-sky-900">{item.sku}</Link></td>
                  <td className="p-4 text-sm text-slate-700">{item.product}</td>
                  <td className="p-4 text-sm text-slate-500">{item.category}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      item.status === 'In Stock' ? 'bg-emerald-100 text-emerald-800' :
                      item.status === 'Sold' ? 'bg-amber-100 text-amber-800' :
                      item.status === 'On Order' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>{item.status}</span>
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-900 text-right">${(item.sale_price ?? item.msrp ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
import { Search, Filter, Plus, Package, ArrowRightLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useInventory } from '@/hooks/useInventory';

export default function Inventory() {
  const { items, isLoading, searchQuery, setSearchQuery, totalInStock, awaitingDelivery, onOrder, lowStockAlerts } = useInventory();

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
          <p className="text-sm text-slate-500 mt-1">Track units, parts, and chemicals across locations</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><ArrowRightLeft className="w-4 h-4 mr-2" />Transfer</button>
          <button className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"><Plus className="w-4 h-4 mr-2" />Add Item</button>
        </div>
      </div>

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
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-sm font-medium"><Link to={`/inventory/${item.id}`} className="text-sky-600 hover:text-sky-900">{item.sku}</Link></td>
                  <td className="p-4 text-sm text-slate-700">{item.product}</td>
                  <td className="p-4 text-sm text-slate-500">{item.category}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      item.status === 'In Stock' ? 'bg-emerald-100 text-emerald-800' :
                      item.status === 'Sold' ? 'bg-amber-100 text-amber-800' :
                      item.status === 'On Order' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-800'
                    }`}>{item.status}</span>
                  </td>
                  <td className="p-4 text-sm font-medium text-slate-900 text-right">${(item.sale_price ?? item.msrp ?? 0).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
