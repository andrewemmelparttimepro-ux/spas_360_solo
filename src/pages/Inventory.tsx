import { Search, Filter, Plus, Package, ArrowRightLeft } from 'lucide-react';

const inventoryItems = [
  { id: 'INV-001', sku: 'SUN-OPT-880-01', product: 'Sundance Optima 880', category: 'Hot Tub', status: 'In Stock', location: 'Minot', price: 14200 },
  { id: 'INV-002', sku: 'CAL-UTO-02', product: 'Caldera Utopia', category: 'Hot Tub', status: 'Sold (Awaiting Delivery)', location: 'Bismarck', price: 16000 },
  { id: 'INV-003', sku: 'JAC-J300-01', product: 'Jacuzzi J-300', category: 'Hot Tub', status: 'On Order', location: 'Minot', price: 9500 },
  { id: 'INV-004', sku: 'CHM-CHL-50', product: 'Chlorine Granules 50lb', category: 'Chemicals', status: 'In Stock', location: 'Bismarck', price: 120 },
  { id: 'INV-005', sku: 'ACC-CVR-8X8', product: 'Premium Cover 8x8', category: 'Accessories', status: 'In Transit', location: 'Minot', price: 450 },
];

export default function Inventory() {
  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-1">Track units, parts, and chemicals across locations</p>
        </div>
        <div className="flex space-x-3">
          <button className="bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
            <ArrowRightLeft className="w-4 h-4 mr-2" />
            Transfer
          </button>
          <button className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            Add Item
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6 shrink-0">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mr-4">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Total Units in Stock</p>
            <p className="text-2xl font-bold text-slate-900">42</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center">
          <div className="p-3 bg-amber-100 text-amber-600 rounded-lg mr-4">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Sold (Awaiting Delivery)</p>
            <p className="text-2xl font-bold text-slate-900">14</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-lg mr-4">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">On Order</p>
            <p className="text-2xl font-bold text-slate-900">8</p>
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex items-center">
          <div className="p-3 bg-red-100 text-red-600 rounded-lg mr-4">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-500">Low Stock Alerts</p>
            <p className="text-2xl font-bold text-slate-900">3</p>
          </div>
        </div>
      </div>

      {/* Data Table */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="relative w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search SKU, product, category..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none"
            />
          </div>
          <button className="flex items-center text-sm font-medium text-slate-600 hover:text-slate-900">
            <Filter className="w-4 h-4 mr-2" />
            More Filters
          </button>
        </div>
        
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-white sticky top-0">
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                <th className="p-4 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {inventoryItems.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-4 text-sm font-medium text-slate-900">{item.sku}</td>
                  <td className="p-4 text-sm text-slate-700">{item.product}</td>
                  <td className="p-4 text-sm text-slate-500">{item.category}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                      ${item.status === 'In Stock' ? 'bg-emerald-100 text-emerald-800' : 
                        item.status === 'Sold (Awaiting Delivery)' ? 'bg-amber-100 text-amber-800' :
                        item.status === 'On Order' ? 'bg-blue-100 text-blue-800' :
                        'bg-slate-100 text-slate-800'
                      }
                    `}>
                      {item.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-slate-500">{item.location}</td>
                  <td className="p-4 text-sm font-medium text-slate-900 text-right">${item.price.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
