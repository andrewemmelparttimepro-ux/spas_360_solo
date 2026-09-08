import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, X } from 'lucide-react';
import { useModal } from '@/hooks/useModal';
import { useRevenueTile } from '@/hooks/useRevenueTile';
import { defaultRevenueTileFilters, revenueStoreLabel, revenueTileDateError, type RevenueTileFilters } from '@/lib/dashboardRevenueTile';

const money = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fieldClass = 'w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30';

function RevenueDetailsDialog({ onClose }: { onClose: () => void }) {
  const { dialogRef, dialogProps } = useModal(onClose);
  const [applied, setApplied] = useState(defaultRevenueTileFilters);
  const [draft, setDraft] = useState<RevenueTileFilters>(applied);
  const { report, options, range, isLoading, error, refresh } = useRevenueTile(applied);
  const dateError = draft.period === 'custom' ? revenueTileDateError(draft.startDate, draft.endDate) : null;
  const ownerName = options?.ownerOptions.find(owner => owner.id === applied.assignedTo)?.name ?? 'All Sales People';
  const storeName = options?.storeOptions.find(store => store.id === applied.locationId)?.name;
  const unapplied = JSON.stringify(draft) !== JSON.stringify(applied);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} {...dialogProps} aria-labelledby="revenue-details-title" aria-describedby="revenue-details-description"
        className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 id="revenue-details-title" className="text-xl font-bold text-ink-100">Recorded Sales</h2>
            <p id="revenue-details-description" className="mt-1 text-sm text-ink-400">Closed-Won deals by close date. Dates include the full day in Central time.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close revenue details" className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X className="h-5 w-5" /></button>
        </div>

        <form onSubmit={event => {
          event.preventDefault();
          if (dateError) return;
          if (unapplied) setApplied({ ...draft });
          else void refresh();
        }} className="space-y-4 rounded-xl border border-ink-700 bg-ink-850 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-ink-300">Sales Person
              <select aria-label="Revenue details sales person" value={draft.assignedTo ?? ''} onChange={event => setDraft(current => ({ ...current, assignedTo: event.target.value || null }))} className={fieldClass}>
                <option value="">All Sales People</option>
                {options?.ownerOptions.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
              </select>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-ink-300">Store
              <select aria-label="Revenue details store" value={draft.locationId ?? ''} onChange={event => setDraft(current => ({ ...current, locationId: event.target.value || null }))} className={fieldClass}>
                <option value="">All Stores</option>
                {options?.storeOptions.map(store => <option key={store.id} value={store.id}>{revenueStoreLabel(store.name)}</option>)}
              </select>
            </label>
          </div>
          <label className="block space-y-1.5 text-xs font-semibold text-ink-300">Date range
            <select aria-label="Revenue details date range" value={draft.period} onChange={event => setDraft(current => ({ ...current, period: event.target.value as RevenueTileFilters['period'] }))} className={fieldClass}>
              <option value="month">This Month</option>
              <option value="custom">Custom Dates</option>
            </select>
          </label>
          {draft.period === 'custom' && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-ink-300">Start date
              <input type="date" aria-label="Revenue details start date" required value={draft.startDate} max={draft.endDate || undefined} onChange={event => setDraft(current => ({ ...current, startDate: event.target.value }))} className={fieldClass} />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-ink-300">End date
              <input type="date" aria-label="Revenue details end date" required value={draft.endDate} min={draft.startDate || undefined} onChange={event => setDraft(current => ({ ...current, endDate: event.target.value }))} className={fieldClass} />
            </label>
          </div>}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!!dateError} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:opacity-50">Apply filters</button>
            <button type="button" onClick={() => {
              const defaults = defaultRevenueTileFilters();
              setDraft(defaults);
              setApplied(defaults);
            }} className="rounded-lg px-2 py-2 text-xs font-semibold text-ink-400 hover:text-ink-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Reset to this month</button>
          </div>
          <p className={`text-xs ${dateError ? 'text-red-400' : 'text-ink-400'}`} aria-live="polite">{dateError ?? (unapplied ? 'Apply filters to update the results below.' : 'Filters applied.')}</p>
        </form>

        <section className="mt-5" aria-label="Revenue details results" aria-busy={isLoading}>
          <p className="mb-3 text-xs text-ink-400">{applied.period === 'month' ? 'This Month' : 'Custom Dates'}{range ? ` · ${range.startDate} to ${range.endDate}` : ''} · {ownerName} · {storeName ? revenueStoreLabel(storeName) : 'All Stores'}</p>
          {isLoading ? <p role="status" className="rounded-xl border border-ink-700 p-5 text-sm text-ink-400">Loading revenue…</p>
            : error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
              <p>Revenue couldn't load. {error}</p>
              <button type="button" onClick={() => void refresh()} className="mt-3 rounded-lg border border-red-500/40 px-3 py-1.5 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Retry revenue</button>
            </div>
            : report && <div className="rounded-xl border border-ink-700 bg-ink-950 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Recorded Closed-Won sales</p>
              <p className="mt-1 break-words text-3xl font-bold tabular-nums text-ink-100">{money(report.total)}</p>
              <Completeness missing={report.missingAmounts} />
              <dl className="mt-4 divide-y divide-ink-700">
                {report.stores.map(store => <div key={store.id} className="flex flex-wrap items-baseline justify-between gap-2 py-3 first:pt-0 last:pb-0">
                  <dt className="text-sm font-semibold text-ink-300">{revenueStoreLabel(store.name)}</dt>
                  <dd className="break-words text-lg font-bold tabular-nums text-ink-100">{money(store.total)}<Completeness missing={store.missingAmounts} /></dd>
                </div>)}
              </dl>
            </div>}
        </section>
      </div>
    </div>, document.body,
  );
}

export default function RevenueTile() {
  const [filters] = useState(defaultRevenueTileFilters);
  const { report, comparison, isLoading, error, refresh } = useRevenueTile(filters, true);
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => { if (error) void refresh(); else setOpen(true); }} aria-haspopup={error ? undefined : 'dialog'} aria-expanded={error ? undefined : open}
      className="dashboard-stat-card relative rounded-xl border border-ink-700 bg-ink-900 col-span-3 min-h-[90px] min-w-0 px-4 py-1.5 text-left transition-all hover:border-brand-500/50 hover:bg-ink-850 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 lg:col-span-1">
      <ArrowUpRight aria-hidden="true" className="absolute right-2.5 top-2.5 h-3.5 w-3.5 text-ink-500" />
      <p className="pr-3 text-[11px] leading-[14px] font-semibold uppercase tracking-wider text-ink-500">Recorded Sales</p>
      <p className="text-[11px] leading-[14px] font-medium text-ink-400">This Month {comparison?.monthName} - Closed-Won</p>
      {isLoading ? <p role="status" className="text-sm text-ink-400">Loading revenue…</p>
        : error ? <p role="alert" className="text-xs text-red-400">Revenue couldn't load. {error} Click to retry.</p>
        : report && <div className="grid grid-cols-2 gap-x-4">
          {[...report.stores].sort((a, b) => revenueStoreLabel(a.name).localeCompare(revenueStoreLabel(b.name))).map(store => <div key={store.id} className="min-w-0">
            <p className="text-[11px] leading-[14px] font-semibold text-ink-400">{revenueStoreLabel(store.name)}</p>
            <p className="flex flex-wrap items-baseline gap-x-1 text-base leading-5 font-bold tabular-nums text-ink-100">
              <span className="inline-block whitespace-nowrap">{money(store.total)}</span><CompactCompleteness missing={store.missingAmounts} />
            </p>
            {comparison && store.previousYear && <p className="flex flex-wrap items-baseline gap-x-1 text-[11px] leading-[14px] tabular-nums text-ink-400">
              <span>Last year’s {comparison.previousYearLabel}: <span className="inline-block whitespace-nowrap">{money(store.previousYear.total)}</span></span>
              <CompactCompleteness missing={store.previousYear.missingAmounts} period="Last year" />
            </p>}
          </div>)}
        </div>}
    </button>
    {open && <RevenueDetailsDialog onClose={() => setOpen(false)} />}
  </>;
}

function Completeness({ missing, period }: { missing: number | null; period?: string }) {
  return missing === 0 ? null : <p className="mt-1 text-xs font-medium text-amber-600">{period ? `${period}: ` : ''}{missing === null ? 'Amount completeness has not been verified.' : `Incomplete: ${missing} closed sale${missing === 1 ? '' : 's'} missing an amount.`}</p>;
}

function CompactCompleteness({ missing, period }: { missing: number | null; period?: string }) {
  if (missing === 0) return null;
  const description = `${period ? `${period}: ` : ''}${missing === null ? 'Amount completeness has not been verified.' : `Incomplete: ${missing} closed sale${missing === 1 ? '' : 's'} missing an amount.`}`;
  return <span title={description} aria-label={description} className="text-[10px] leading-[14px] font-medium text-amber-600">({missing === null ? 'unverified' : `${missing} missing`})</span>;
}
