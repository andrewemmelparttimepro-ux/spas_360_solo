import { Search, Plus, X, Check, Pencil, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Fragment, useState, useRef, useEffect } from 'react';
import { useInventory, type InventoryListItem } from '@/hooks/useInventory';
import { useAuth } from '@/contexts/AuthContext';
import StoreSwitcher from '@/components/StoreSwitcher';
import InventoryEditor from '@/components/InventoryEditor';
import type { Contact, InventoryItem } from '@/types/database';
import { cn, sanitizeSearchTerm } from '@/lib/utils';
import { filterCustomersByNamePrefix } from '@/lib/customerSearch';
import { supabase } from '@/lib/supabase';
import {
  INVENTORY_STOCK_STATES,
  inventoryCustomerStockUpdate,
  inventoryStockState,
  joinSerialAndFlooring,
  serialNumberForDisplay,
  splitSerialAndFlooring,
} from '@/lib/inventoryFields';
import { groupInventoryItems } from '@/lib/inventoryGrouping';
import { ALL_INVENTORY_BRANDS, inventoryBrandOptions, inventoryMatchesBrand } from '@/lib/inventoryBrandFilter';
import { inventoryAgeLabelForItem } from '@/lib/inventoryAge';
import { effectiveInventoryCustomer, hasManagedInventoryAssignment } from '@/lib/inventoryDealAssignment';

const INVENTORY_HEADER_CELL_CLASS = 'px-3 py-2 text-[11px] font-semibold text-ink-400 uppercase tracking-wider whitespace-nowrap';
const INVENTORY_GROUP_HEADER_CELL_CLASS = 'px-3 py-1 text-left';
const INVENTORY_ROW_CELL_CLASS = 'px-3 py-0.5 text-xs leading-4';

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
  commitWhenUnchanged = false,
}: {
  value: string | number | null;
  field: string;
  itemId: string;
  onSave: (id: string, updates: Partial<InventoryItem>) => Promise<boolean>;
  type?: 'text' | 'number' | 'date' | 'select';
  options?: string[];
  prefix?: string;
  className?: string;
  commitWhenUnchanged?: boolean;
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
    if (!commitWhenUnchanged && submittedValue === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    setSaveError(null);
    const parsed = type === 'number'
      ? (submittedValue ? parseFloat(submittedValue) : null)
      : type === 'date'
        ? (submittedValue || null)
        : submittedValue;
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
      tabIndex={0} role="button"
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSaveError(null); setEditing(true); } }}
      onClick={() => { setSaveError(null); setEditing(true); }}
      className={cn(
        "min-h-6 cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 transition-colors hover:bg-brand-500/10 hover:ring-1 hover:ring-brand-500/30 group inline-flex items-center gap-1",
        className
      )}
      title="Click to edit"
    >
      {display}
      <Pencil className="w-3 h-3 text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </span>
  );
}

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

function CustomerCell({
  item,
  onSave,
}: {
  item: InventoryListItem;
  onSave: (id: string, updates: Partial<InventoryItem>) => Promise<boolean>;
}) {
  const { profile } = useAuth();
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [matches, setMatches] = useState<CustomerChoice[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const effectiveCustomer = effectiveInventoryCustomer(item);
  const currentCustomerName = effectiveCustomer
    ? `${effectiveCustomer.first_name} ${effectiveCustomer.last_name}`.trim()
    : null;
  const value = currentCustomerName || ((effectiveCustomer?.id ?? item.customer_id) ? 'Customer' : '-');
  const managedAssignment = hasManagedInventoryAssignment(item);

  useEffect(() => {
    if (!editing) return;
    setQuery('');
    setDebouncedQuery('');
    setMatches([]);
    setSaveError(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const timer = window.setTimeout(() => setDebouncedQuery(query), 200);
    return () => window.clearTimeout(timer);
  }, [editing, query]);

  useEffect(() => {
    if (!editing || !profile) return;
    const normalized = sanitizeSearchTerm(debouncedQuery);
    if (normalized.length < 2) {
      setMatches([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    const searchCustomers = async () => {
      setSearching(true);
      const prefix = normalized.split(' ')[0];
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, phone, customer_type')
        .eq('org_id', profile.org_id)
        .or(`first_name.ilike.${prefix}%,last_name.ilike.${prefix}%`)
        .order('last_name', { ascending: true })
        .order('first_name', { ascending: true })
        .limit(20);
      if (cancelled) return;
      if (error) {
        console.error('Error searching customers for inventory:', error);
        setMatches([]);
        setSaveError('Could not search customers. Try again.');
      } else {
        setSaveError(null);
        setMatches(filterCustomersByNamePrefix((data ?? []) as CustomerChoice[], normalized).slice(0, 8));
      }
      setSearching(false);
    };
    void searchCustomers();
    return () => { cancelled = true; };
  }, [debouncedQuery, editing, profile]);

  const saveCustomerUpdate = async (updates: Partial<InventoryItem>) => {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    let saved = false;
    try {
      saved = await onSave(item.id, updates);
    } catch {
      saved = false;
    } finally {
      setSaving(false);
    }
    if (saved) {
      setEditing(false);
      return;
    }
    setSaveError('Could not save. Try again.');
  };

  const saveChoice = (customer: CustomerChoice) => saveCustomerUpdate(
    inventoryCustomerStockUpdate(item.notes, {
      kind: 'customer',
      customerId: customer.id,
      customerName: `${customer.first_name} ${customer.last_name}`.trim(),
    }),
  );

  const saveUnassignment = () => saveCustomerUpdate(
    inventoryCustomerStockUpdate(item.notes, {
      kind: 'stationary',
      value: 'Stock',
    }),
  );

  if (!editing) {
    if (managedAssignment) {
      return (
        <span
          className="inline-flex min-h-6 items-center rounded px-1.5 py-0.5 -mx-1.5"
          title="Managed by a linked deal or job"
        >
          {value}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex min-h-6 cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 -mx-1.5 text-left transition-colors hover:bg-brand-500/10 hover:ring-1 hover:ring-brand-500/30"
        title="Choose a customer"
        aria-label={`Edit Customer for ${item.model || item.product}`}
      >
        <span>{value}</span>
        <Pencil className="h-3 w-3 shrink-0 text-ink-300 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  const normalizedQuery = sanitizeSearchTerm(query);
  return (
    <div className="relative min-w-[240px]" onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }}>
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          value={query}
          onChange={event => { setQuery(event.target.value); setSaveError(null); }}
          placeholder="Type a customer name…"
          aria-label="Search customers"
          disabled={saving}
          className="w-full rounded-lg border border-brand-500 bg-ink-950 px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-500/30"
        />
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ink-700 text-ink-400 hover:bg-ink-800 disabled:opacity-50"
          aria-label="Cancel customer selection"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="absolute left-0 top-full z-30 mt-1 w-full overflow-hidden rounded-lg border border-ink-700 bg-ink-950 shadow-xl">
        <button
          type="button"
          onClick={() => void saveUnassignment()}
          disabled={saving}
          className="block w-full border-b border-ink-800 px-3 py-2 text-left text-xs font-semibold text-ink-200 hover:bg-brand-500/10 disabled:opacity-50"
        >
          Unassign Customer
        </button>
        <Link
          to="/customers"
          state={{ openWizard: true }}
          className="flex w-full items-center gap-2 border-b border-ink-800 px-3 py-2 text-left text-xs font-semibold text-brand-300 hover:bg-brand-500/10"
        >
          <Plus className="h-3.5 w-3.5" />Add New Customer
        </Link>
        {searching && <div className="flex items-center gap-2 px-3 py-2 text-xs text-ink-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Searching customers…</div>}
        {!searching && normalizedQuery.length < 2 && <p className="px-3 py-2 text-xs text-ink-500">Type at least 2 characters.</p>}
        {!searching && normalizedQuery.length >= 2 && matches.length === 0 && !saveError && <p className="px-3 py-2 text-xs text-ink-500">No matching customers.</p>}
        {matches.map(customer => (
          <button
            key={customer.id}
            type="button"
            onClick={() => void saveChoice(customer)}
            disabled={saving}
            className="block w-full border-t border-ink-800 px-3 py-2 text-left hover:bg-brand-500/10 disabled:opacity-50"
          >
            <span className="block text-xs font-semibold text-ink-200">{customer.first_name} {customer.last_name}</span>
            <span className="block text-[10px] text-ink-500">{customer.phone} · {customer.customer_type}</span>
          </button>
        ))}
        {saveError && <p role="alert" className="border-t border-ink-800 px-3 py-2 text-[11px] font-medium text-red-400">{saveError}</p>}
      </div>
    </div>
  );
}

type CustomerChoice = Pick<Contact, 'id' | 'first_name' | 'last_name' | 'phone' | 'customer_type'>;

function StockStateCell({
  item,
  onSave,
}: {
  item: InventoryItem;
  onSave: (id: string, updates: Partial<InventoryItem>) => Promise<boolean>;
}) {
  const value = inventoryStockState(item.stock_state, item.notes, item.status);
  return (
    <EditableCell
      value={value}
      field="stock_state"
      itemId={item.id}
      onSave={onSave}
      type="select"
      options={[...INVENTORY_STOCK_STATES]}
      commitWhenUnchanged={item.stock_state === null}
    />
  );
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

// =============== Main page component ===============
export default function Inventory() {
  const { items, isLoading, searchQuery, setSearchQuery, totalInStock, awaitingDelivery, onOrder, lowStockAlerts, createItem, updateItem, deleteItem } = useInventory();
  const { locations, activeLocationId } = useAuth();
  // With every store on screen, each row must say which floor it's on
  const showStore = !activeLocationId;
  const [brandFilter, setBrandFilter] = useState(ALL_INVENTORY_BRANDS);
  // Editor drawer: null = closed, 'new' = create, item = edit
  const [editorTarget, setEditorTarget] = useState<'new' | InventoryItem | null>(null);

  const handleEditorSave = async (values: Partial<InventoryItem>, id?: string) => {
    if (id) return updateItem(id, values);
    return (await createItem(values)) !== null;
  };

  const summaryCards = [
    { label: 'In Stock', value: totalInStock },
    { label: 'Sold, Awaiting Delivery', value: awaitingDelivery },
    { label: 'On Order', value: onOrder },
    { label: 'Low Stock', value: lowStockAlerts },
  ];
  const brandOptions = inventoryBrandOptions(items);
  const visibleItems = items.filter(item => inventoryMatchesBrand(item, brandFilter));
  const groupedItems = groupInventoryItems(visibleItems);
  const columnCount = showStore ? 12 : 11;
  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* Compact chrome: this page IS the table — everything above it stays one line tall. */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 shrink-0">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600">Sales</p>
          <h1 className="mt-0.5 text-[22px] sm:text-[26px] leading-tight font-bold text-ink-100 tracking-tight">Inventory</h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {summaryCards.map(card => (
            <div key={card.label} className="flex items-baseline gap-2">
              <span className="text-lg font-bold text-ink-100 tabular-nums">{card.value}</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">{card.label}</span>
            </div>
          ))}
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

      <div className="bg-ink-900 rounded-xl border border-ink-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-ink-700 flex flex-wrap items-center gap-3 bg-ink-950">
          <StoreSwitcher />
          <div className="relative flex-1 min-w-[220px] max-w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
            <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search serial number, model, category..." className="w-full pl-9 pr-4 py-2 bg-ink-900 border border-ink-700 rounded-lg text-sm focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none" />
          </div>
          <label className="ml-auto flex items-center gap-2 text-sm font-medium text-ink-400">
            Brand
            <select
              value={brandFilter}
              onChange={event => setBrandFilter(event.target.value)}
              className="bg-ink-900 border border-ink-700 text-ink-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
              aria-label="Filter inventory"
            >
              <option>{ALL_INVENTORY_BRANDS}</option>
              {brandOptions.map(brand => <option key={brand}>{brand}</option>)}
            </select>
          </label>
        </div>
        {/* The app shell owns vertical scrolling; this region only handles a narrow viewport. */}
        <div className="overflow-x-auto">
          <table data-density="compact" className="w-full min-w-[1460px] text-left border-collapse">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-900 sticky top-0 z-10">
                <th className={INVENTORY_HEADER_CELL_CLASS}>Model</th>
                {showStore && <th className={INVENTORY_HEADER_CELL_CLASS}>Store</th>}
                <th className={INVENTORY_HEADER_CELL_CLASS}>Color Combination</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>Serial Number</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>Inventory Flooring Status</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>Inventory Age</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>Customer</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>Stock</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>Order Date</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>Date Received</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>Delivery Date</th>
                <th className={INVENTORY_HEADER_CELL_CLASS}>On Hand Y/N</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {visibleItems.length === 0 ? (
                <tr><td colSpan={columnCount} className="p-8 text-center text-ink-500">No inventory items found</td></tr>
              ) : groupedItems.map(group => (
                <Fragment key={group.key}>
                  <tr className={cn('border-y border-ink-700', group.headerClassName)}>
                    <th colSpan={columnCount} scope="rowgroup" className={INVENTORY_GROUP_HEADER_CELL_CLASS}>
                      <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]">
                        <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', group.dotClassName)} />
                        {group.label}
                        <span className="font-semibold tracking-normal opacity-70">{group.items.length}</span>
                      </span>
                    </th>
                  </tr>
                  {group.items.map(item => (
                    <tr key={item.id} onDoubleClick={() => setEditorTarget(item)} className={cn('transition-colors', group.tintClassName)}>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300 whitespace-nowrap')}>
                    <Link to={`/inventory/${item.id}`} className="text-brand-400 hover:text-brand-300 hover:underline">
                      {item.model || item.product}
                    </Link>
                  </td>
                  {showStore && (
                    <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300')}>
                      <span
                        className="inline-flex items-center whitespace-nowrap rounded-full bg-ink-950 border border-ink-700 px-2 py-0.5 text-xs font-medium"
                        title={((item as unknown as { locations?: { name?: string } }).locations?.name) ?? undefined}
                      >
                        {(((item as unknown as { locations?: { name?: string } }).locations?.name) ?? '—').split(' (')[0]}
                      </span>
                    </td>
                  )}
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-400')}>
                    <EditableCell value={item.color_finish} field="color_finish" itemId={item.id} onSave={updateItem} />
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300')}>
                    <InventoryTextCell item={item} part="serial" onSave={updateItem} />
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300')}>
                    <InventoryTextCell item={item} part="flooring" onSave={updateItem} />
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300 tabular-nums whitespace-nowrap')}>
                    {inventoryAgeLabelForItem(item.date_received, item.created_at)}
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300')}>
                    <CustomerCell item={item} onSave={updateItem} />
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300')}>
                    <StockStateCell item={item} onSave={updateItem} />
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300')}>
                    <EditableCell value={item.order_date} field="order_date" itemId={item.id} onSave={updateItem} type="date" />
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300')}>
                    <EditableCell value={item.date_received} field="date_received" itemId={item.id} onSave={updateItem} type="date" />
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'text-ink-300')}>
                    <EditableCell value={item.date_delivered} field="date_delivered" itemId={item.id} onSave={updateItem} type="date" />
                  </td>
                  <td className={cn(INVENTORY_ROW_CELL_CLASS, 'font-semibold text-ink-200')}>
                    <OnHandCell item={item} onSave={updateItem} />
                  </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
