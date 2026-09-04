import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, LoaderCircle, Palette, RotateCcw, Trash2, X } from 'lucide-react';
import DialogKeys from '@/components/ui/DialogKeys';
import { useInventoryFlooringReport } from '@/hooks/useInventoryFlooringReport';
import {
  INVENTORY_FLOORING_DESIGNATIONS,
  INVENTORY_FLOORING_ROW_COLORS,
  inventoryFlooringAmountSummary,
  inventoryFlooringDesignation,
  inventoryFlooringOptions,
  inventoryForFlooring,
  inventoryForStore,
  inventoryFlooringRowIsRemoved,
  isInventoryFlooringDesignation,
  type InventoryFlooringDesignation,
  type InventoryFlooringReportItem,
  type InventoryFlooringStore,
} from '@/lib/inventoryFlooringReport';
import { splitSerialAndFlooring } from '@/lib/inventoryFields';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function InventoryFlooringStatusReport() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedFlooring, setSelectedFlooring] = useState('');
  const [selectedStore, setSelectedStore] = useState<InventoryFlooringStore>('');
  const [showRemoved, setShowRemoved] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const report = useInventoryFlooringReport(isOpen);
  const flooringOptions = useMemo(() => inventoryFlooringOptions(report.items), [report.items]);
  const filteredItems = useMemo(
    () => inventoryForFlooring(inventoryForStore(report.items, selectedStore), selectedFlooring),
    [report.items, selectedFlooring, selectedStore],
  );
  const activeItems = useMemo(
    () => filteredItems.filter(item => !inventoryFlooringRowIsRemoved(item)),
    [filteredItems],
  );
  const visibleItems = showRemoved ? filteredItems : activeItems;
  const amountSummary = inventoryFlooringAmountSummary(activeItems);
  const selectedItem = visibleItems.find(item => item.id === selectedRowId) ?? null;

  useEffect(() => {
    if (selectedRowId && !visibleItems.some(item => item.id === selectedRowId)) setSelectedRowId(null);
  }, [selectedRowId, visibleItems]);

  const closeReport = () => {
    setSelectedFlooring('');
    setSelectedStore('');
    setShowRemoved(false);
    setSelectedRowId(null);
    setRowActionError(null);
    setIsOpen(false);
  };

  const updateSelectedRowColor = async (color: string | null) => {
    if (!selectedItem) return;
    setRowActionError(null);
    try {
      await report.updateBackgroundColor(selectedItem, color);
    } catch (error) {
      setRowActionError(error instanceof Error ? error.message : 'Row color could not be saved.');
    }
  };

  const removeRow = async (item: InventoryFlooringReportItem) => {
    const label = item.model || item.product;
    if (!window.confirm(`Remove ${label} from this flooring report? Its inventory record will be preserved.`)) return;
    setRowActionError(null);
    try {
      await report.setReportRemoved(item, true);
      setSelectedRowId(null);
    } catch (error) {
      setRowActionError(error instanceof Error ? error.message : 'Row could not be removed from the report.');
    }
  };

  const restoreRow = async (item: InventoryFlooringReportItem) => {
    setRowActionError(null);
    try {
      await report.setReportRemoved(item, false);
    } catch (error) {
      setRowActionError(error instanceof Error ? error.message : 'Row could not be restored.');
    }
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
          <span className="mt-1 block text-sm text-ink-500">Review every inventory item by flooring designation, enter its amount, and total the selected segment.</span>
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

            <div className="grid gap-3 border-b border-ink-700 bg-ink-950/45 px-4 py-3 sm:grid-cols-3 sm:px-6">
              <label className="block text-xs font-semibold text-ink-400">
                Store
                <select
                  aria-label="Store"
                  value={selectedStore}
                  onChange={event => setSelectedStore(event.target.value as InventoryFlooringStore)}
                  className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40"
                >
                  <option value="">All Stores</option>
                  <option value="Minot">Minot</option>
                  <option value="Bismarck">Bismarck</option>
                </select>
              </label>
              <label className="block text-xs font-semibold text-ink-400">
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
              <label className="flex items-end gap-2 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-xs font-semibold text-ink-400">
                <input
                  type="checkbox"
                  checked={showRemoved}
                  onChange={event => setShowRemoved(event.target.checked)}
                  className="h-4 w-4 accent-amber-500"
                />
                Show paid-off rows
              </label>
            </div>

            <div
              role="status"
              aria-live="polite"
              aria-label="Filtered inventory flooring amount summary"
              className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-700 bg-amber-500/10 px-4 py-3 sm:px-6"
            >
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-500">Total amount owed</p>
                <p className="mt-0.5 text-sm text-ink-400">
                  {selectedStore || 'All Stores'} · {selectedFlooring || 'All flooring designations'} · {activeItems.length} active {activeItems.length === 1 ? 'item' : 'items'}
                </p>
                {!report.isLoading && amountSummary.missingCount > 0 && (
                  <p className="mt-1 text-xs text-amber-400">
                    {amountSummary.missingCount} blank; total includes {amountSummary.recordedCount} entered {amountSummary.recordedCount === 1 ? 'amount' : 'amounts'} only.
                  </p>
                )}
              </div>
              <p className="text-2xl font-bold tabular-nums text-ink-100">
                {report.isLoading ? 'Loading total…' : currency.format(amountSummary.total)}
              </p>
            </div>

            {selectedItem && (
              <div role="group" aria-label={`Row color for ${selectedItem.model || selectedItem.product}`} className="flex flex-wrap items-center gap-2 border-b border-ink-700 bg-ink-950 px-4 py-2 sm:px-6">
                <Palette className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold text-ink-300">Row color</span>
                {INVENTORY_FLOORING_ROW_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Set row background to ${color}`}
                    onClick={() => { void updateSelectedRowColor(color); }}
                    className="h-7 w-7 rounded-md border border-white/30 shadow-sm"
                    style={{ backgroundColor: color }}
                  />
                ))}
                <label className="flex items-center gap-1 text-xs text-ink-400">
                  Custom
                  <input
                    type="color"
                    aria-label="Custom row background color"
                    value={selectedItem.flooring_report.background_color ?? '#17365D'}
                    onChange={event => { void updateSelectedRowColor(event.target.value); }}
                    className="h-7 w-9 cursor-pointer rounded border border-ink-700 bg-transparent"
                  />
                </label>
                <button type="button" onClick={() => { void updateSelectedRowColor(null); }} className="inline-flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:text-ink-100">
                  <RotateCcw className="h-3 w-3" /> Clear
                </button>
              </div>
            )}
            {rowActionError && <div role="alert" className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-xs text-red-300 sm:px-6">{rowActionError}</div>}

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
                        <tr><th className="px-3 py-2 text-center">#</th><th className="px-3 py-2">Inventory</th><th className="px-3 py-2">Store</th><th className="px-3 py-2">Serial number</th><th className="px-3 py-2">Flooring designation</th><th className="px-3 py-2">Status / customer</th><th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Report</th></tr>
                      </thead>
                      <tbody>
                        {visibleItems.map((item, index) => {
                          const serial = splitSerialAndFlooring(item.sku).serial;
                          const isRemoved = inventoryFlooringRowIsRemoved(item);
                          return (
                            <tr
                              key={item.id}
                              className={`border-t border-ink-800 text-ink-300 ${isRemoved ? 'opacity-60' : ''}`}
                              style={{ backgroundColor: item.flooring_report.background_color ?? undefined }}
                            >
                              <td className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  aria-pressed={selectedRowId === item.id}
                                  aria-label={`Select row ${index + 1} for background color`}
                                  onClick={() => setSelectedRowId(current => current === item.id ? null : item.id)}
                                  className={`h-7 min-w-7 rounded-md border px-1 text-xs font-bold ${selectedRowId === item.id ? 'border-amber-500 text-amber-400' : 'border-ink-700 text-ink-400 hover:text-ink-100'}`}
                                >
                                  {index + 1}
                                </button>
                              </td>
                              <td className="px-3 py-2 font-medium text-ink-100">{item.model || item.product}<span className="block text-xs font-normal text-ink-500">{item.brand || item.product}</span></td>
                              <td className="px-3 py-2">{item.locations?.name || '—'}</td>
                              <td className="px-3 py-2">{serial || '—'}</td>
                              <td className="px-3 py-2"><FlooringDesignationSelect item={item} onSave={report.updateDesignation} /></td>
                              <td className="px-3 py-2"><FlooringStatusInput item={item} onSave={report.updateStatusText} /></td>
                              <td className="px-3 py-2 text-right"><FlooringAmountInput item={item} onSave={report.updateAmount} /></td>
                              <td className="px-3 py-2 text-right">
                                {isRemoved ? (
                                  <button type="button" onClick={() => { void restoreRow(item); }} className="rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-300 hover:text-ink-100">Restore</button>
                                ) : (
                                  <button type="button" aria-label={`Remove ${item.model || item.product} from flooring report`} onClick={() => { void removeRow(item); }} className="inline-flex items-center gap-1 rounded-md border border-ink-700 px-2 py-1 text-xs text-ink-400 hover:border-red-500/50 hover:text-red-300"><Trash2 className="h-3 w-3" /> Paid off</button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {!visibleItems.length && <tr><td colSpan={8} className="px-3 py-10 text-center text-sm text-ink-500">No inventory matches these store and flooring filters.</td></tr>}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-ink-700 bg-ink-950 font-bold text-ink-100">
                          <td colSpan={6} className="px-3 py-3 text-right">
                            {selectedFlooring || 'All inventory'} total Amount ({activeItems.length} active {activeItems.length === 1 ? 'item' : 'items'})
                            {amountSummary.missingCount > 0 && <span className="mt-1 block text-xs font-normal text-amber-400">{amountSummary.missingCount} blank; total includes {amountSummary.recordedCount} entered {amountSummary.recordedCount === 1 ? 'amount' : 'amounts'} only.</span>}
                          </td>
                          <td className="px-3 py-3 text-right tabular-nums">{currency.format(amountSummary.total)}</td>
                          <td aria-hidden="true" />
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

type FlooringDesignationSelectProps = {
  item: InventoryFlooringReportItem;
  onSave: (item: InventoryFlooringReportItem, designation: InventoryFlooringDesignation) => Promise<void>;
};

function FlooringDesignationSelect({ item, onSave }: FlooringDesignationSelectProps) {
  const storedValue = inventoryFlooringDesignation(item);
  const value = isInventoryFlooringDesignation(storedValue) ? storedValue : '';
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (designation: string) => {
    if (!isInventoryFlooringDesignation(designation) || designation === value) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave(item, designation);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Flooring status could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-w-48">
      <select
        aria-label={`Flooring status for ${item.model || item.product}`}
        value={value}
        disabled={isSaving}
        onChange={event => { void save(event.target.value); }}
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-ink-100 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 disabled:opacity-60"
      >
        {!value && <option value="" disabled>Select flooring status</option>}
        {INVENTORY_FLOORING_DESIGNATIONS.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
      {isSaving && <span className="mt-1 block text-[10px] text-ink-500">Saving…</span>}
      {error && <span role="alert" className="mt-1 block text-[10px] leading-tight text-red-400">{error}</span>}
    </div>
  );
}

type FlooringAmountInputProps = {
  item: Parameters<typeof inventoryFlooringAmountSummary>[0][number];
  onSave: (item: InventoryFlooringReportItem, amount: number | null) => Promise<void>;
};

function FlooringAmountInput({ item, onSave }: FlooringAmountInputProps) {
  const storedValue = item.flooring_amount === null ? '' : String(item.flooring_amount);
  const [value, setValue] = useState(storedValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSaving) setValue(storedValue);
  }, [isSaving, storedValue]);

  const save = async () => {
    const trimmed = value.trim();
    const parsedAmount = trimmed === '' ? null : Number(trimmed);
    const nextAmount = parsedAmount === null ? null : Math.round(parsedAmount * 100) / 100;
    if (nextAmount !== null && (!Number.isFinite(nextAmount) || nextAmount < 0)) {
      setError('Enter a non-negative amount or leave blank.');
      return;
    }
    if (nextAmount === (item.flooring_amount === null ? null : Number(item.flooring_amount))) {
      setError(null);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(item, nextAmount);
    } catch (saveError) {
      setValue(storedValue);
      setError(saveError instanceof Error ? saveError.message : 'Amount could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="ml-auto w-36">
      <div className="flex items-center rounded-lg border border-ink-700 bg-ink-900 focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500/40">
        <span className="pl-2 text-xs text-ink-500">$</span>
        <input
          type="number"
          min="0"
          step="0.01"
          inputMode="decimal"
          aria-label={`Amount for ${item.model || item.product}`}
          value={value}
          disabled={isSaving}
          placeholder="Blank"
          onChange={event => setValue(event.target.value)}
          onBlur={save}
          onKeyDown={event => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
          className="min-w-0 flex-1 bg-transparent px-1.5 py-1.5 text-right text-sm tabular-nums text-ink-100 outline-none disabled:opacity-60"
        />
      </div>
      {isSaving && <span className="mt-1 block text-[10px] text-ink-500">Saving…</span>}
      {error && <span role="alert" className="mt-1 block text-[10px] leading-tight text-red-400">{error}</span>}
    </div>
  );
}

type FlooringStatusInputProps = {
  item: InventoryFlooringReportItem;
  onSave: (item: InventoryFlooringReportItem, statusText: string) => Promise<void>;
};

function FlooringStatusInput({ item, onSave }: FlooringStatusInputProps) {
  const storedValue = item.flooring_report.status_text ?? '';
  const [value, setValue] = useState(storedValue);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSaving) setValue(storedValue);
  }, [isSaving, storedValue]);

  const save = async () => {
    const nextValue = value.trim();
    if (nextValue === storedValue) {
      setError(null);
      return;
    }
    if (nextValue.length > 120) {
      setError('Use 120 characters or fewer.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      await onSave(item, nextValue);
    } catch (saveError) {
      setValue(storedValue);
      setError(saveError instanceof Error ? saveError.message : 'Status could not be saved.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-w-44">
      <input
        type="text"
        maxLength={120}
        aria-label={`Status or customer for ${item.model || item.product}`}
        value={value}
        disabled={isSaving}
        placeholder="Customer name"
        onChange={event => setValue(event.target.value)}
        onBlur={() => { void save(); }}
        onKeyDown={event => {
          if (event.key === 'Enter') event.currentTarget.blur();
          if (event.key === 'Escape') {
            setValue(storedValue);
            event.currentTarget.blur();
          }
        }}
        className="w-full rounded-lg border border-ink-700 bg-ink-900 px-2 py-1.5 text-sm text-ink-100 outline-none placeholder:text-ink-600 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/40 disabled:opacity-60"
      />
      <span className="mt-1 block text-[10px] text-ink-500">Inventory: {item.status}</span>
      {isSaving && <span className="mt-1 block text-[10px] text-ink-500">Saving…</span>}
      {error && <span role="alert" className="mt-1 block text-[10px] leading-tight text-red-400">{error}</span>}
    </div>
  );
}
