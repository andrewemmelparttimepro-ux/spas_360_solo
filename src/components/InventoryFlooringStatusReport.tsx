import { useMemo, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, X } from 'lucide-react';
import DialogKeys from '@/components/ui/DialogKeys';
import { useInventoryFlooringReport } from '@/hooks/useInventoryFlooringReport';
import {
  inventoryFlooringCostSummary,
  inventoryFlooringDesignation,
  inventoryFlooringOptions,
  inventoryForFlooring,
} from '@/lib/inventoryFlooringReport';
import { splitSerialAndFlooring } from '@/lib/inventoryFields';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function InventoryFlooringStatusReport() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFlooring, setSelectedFlooring] = useState('');
  const report = useInventoryFlooringReport(isOpen);
  const flooringOptions = useMemo(() => inventoryFlooringOptions(report.items), [report.items]);
  const visibleItems = useMemo(
    () => inventoryForFlooring(report.items, selectedFlooring),
    [report.items, selectedFlooring],
  );
  const costSummary = inventoryFlooringCostSummary(visibleItems);

  const closeReport = () => {
    setSelectedFlooring('');
    setIsOpen(false);
  };

  return (
    <section aria-labelledby="inventory-flooring-status-heading">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
        className="group flex w-full items-center gap-4 rounded-2xl border border-ink-700 bg-ink-900 p-5 text-left shadow-sm transition-colors hover:border-amber-500/60"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
          <FileSpreadsheet className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span id="inventory-flooring-status-heading" className="block text-base font-bold text-ink-100 group-hover:text-amber-600">Inventory Flooring Status</span>
          <span className="mt-1 block text-sm text-ink-500">Review every inventory item by flooring designation and see the filtered inventory cost.</span>
        </span>
        <span className="rounded-lg border border-ink-700 px-3 py-2 text-xs font-bold text-ink-300 group-hover:border-amber-500/60 group-hover:text-amber-600">Open report</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-5" onClick={closeReport}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-flooring-status-report-title"
            className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-ink-700 bg-ink-900 shadow-2xl"
            onClick={event => event.stopPropagation()}
          >
            <DialogKeys onClose={closeReport} />
            <header className="flex items-start justify-between gap-4 border-b border-ink-700 px-4 py-4 sm:px-6">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-500">Owner report</p>
                <h2 id="inventory-flooring-status-report-title" className="mt-1 flex items-center gap-2 text-xl font-bold text-ink-100"><FileSpreadsheet className="h-5 w-5 text-amber-500" /> Inventory Flooring Status</h2>
                <p className="mt-1 text-sm text-ink-500">All active inventory across every store, grouped by its recorded flooring source.</p>
              </div>
              <button type="button" aria-label="Close Inventory Flooring Status report" onClick={closeReport} className="rounded-lg border border-ink-700 p-2 text-ink-400 hover:text-ink-100"><X className="h-4 w-4" /></button>
            </header>

            <div className="border-b border-ink-700 bg-ink-950/45 px-4 py-3 sm:px-6">
              <label className="block max-w-sm text-xs font-semibold text-ink-400">
                Flooring designation
                <select
                  aria-label="Flooring designation"
                  value={selectedFlooring}
                  onChange={event => setSelectedFlooring(event.target.value)}
                  className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40"
                >
                  <option value="">All flooring designations</option>
                  {flooringOptions.map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              </label>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3 sm:p-5">
              {report.error ? (
                <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-300">
                  Inventory flooring could not be loaded. ({report.error})
                </div>
              ) : report.isLoading ? (
                <p className="flex items-center justify-center gap-2 py-12 text-sm text-ink-500"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading all inventory…</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-ink-700 bg-ink-950/50">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead className="text-left text-[11px] uppercase tracking-wide text-ink-500">
                        <tr><th className="px-3 py-2">Inventory</th><th className="px-3 py-2">Store</th><th className="px-3 py-2">Serial number</th><th className="px-3 py-2">Flooring designation</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Inventory cost</th></tr>
                      </thead>
                      <tbody>
                        {visibleItems.map(item => {
                          const serial = splitSerialAndFlooring(item.sku).serial;
                          return (
                            <tr key={item.id} className="border-t border-ink-800 text-ink-300">
                              <td className="px-3 py-2 font-medium text-ink-100">{item.model || item.product}<span className="block text-xs font-normal text-ink-500">{item.brand || item.product}</span></td>
                              <td className="px-3 py-2">{item.locations?.name || '—'}</td>
                              <td className="px-3 py-2">{serial || '—'}</td>
                              <td className="px-3 py-2">{inventoryFlooringDesignation(item) || 'Unassigned'}</td>
                              <td className="px-3 py-2">{item.status}</td>
                              <td className="px-3 py-2 text-right tabular-nums">{item.cost === null ? 'Not recorded' : currency.format(Number(item.cost))}</td>
                            </tr>
                          );
                        })}
                        {!visibleItems.length && <tr><td colSpan={6} className="px-3 py-10 text-center text-sm text-ink-500">No inventory matches this flooring designation.</td></tr>}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-ink-700 bg-ink-950 font-bold text-ink-100">
                          <td colSpan={5} className="px-3 py-3 text-right">
                            {selectedFlooring || 'All inventory'} total cost ({visibleItems.length} {visibleItems.length === 1 ? 'item' : 'items'})
                            {costSummary.missingCount > 0 && <span className="mt-1 block text-xs font-normal text-amber-400">{costSummary.missingCount} {costSummary.missingCount === 1 ? 'item is' : 'items are'} missing cost; the total cannot be finalized.</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{costSummary.missingCount > 0 ? 'Not available' : currency.format(costSummary.total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
