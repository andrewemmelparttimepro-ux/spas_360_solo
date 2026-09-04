import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BarChart3, Building2, Crown, FileText, LoaderCircle, LockKeyhole, Settings, ShieldCheck } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOwnersReport } from '@/hooks/useOwnersReport';
import {
  OWNERS_REPORT_PRESET_LABELS,
  closedDealsForRange,
  closingRates,
  ownersReportRanges,
  reportDelta,
  reportTotals,
  type OwnersReportComparison,
  type OwnersReportComparisonPeriod,
  type OwnersReportCustomRange,
  type OwnersReportOutcome,
  type OwnersReportPreset,
  type OwnersReportRange,
  type OwnersReportRanges,
} from '@/lib/ownersReport';
import { salespersonGrossRanking, viewOwnersReportPdf, type OwnersReportPdfInput } from '@/lib/ownersReportPdf';
import { PaidCommissionsTracker } from '@/components/PaidCommissionsTracker';
import { InventoryFlooringStatusReport } from '@/components/InventoryFlooringStatusReport';
import { OwnerWorkbookLibrary } from '@/components/OwnerWorkbookLibrary';
import StaffTimeReport from '@/components/StaffTimeReport';
import RecurringChecklists from '@/components/RecurringChecklists';

const OWNER_DESTINATIONS = [
  {
    name: 'Reports',
    description: 'Review dealership performance, pipeline, service, and inventory reporting.',
    path: '/reports',
    icon: BarChart3,
  },
  {
    name: 'Citadel',
    description: 'Open the canonical workspace for Ari briefs, proposals, and other deliverables.',
    path: '/citadel',
    icon: Building2,
  },
  {
    name: 'Settings',
    description: 'Manage the organization profile, team, branding, and owner controls.',
    path: '/settings',
    icon: Settings,
  },
] as const;

export default function OwnersCorner() {
  const { profile } = useAuth();
  const isOwner = profile?.role === 'owner_manager';

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header>
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.22em] text-amber-500">Owner workspace</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-100">
          <Crown className="h-6 w-6 text-amber-500" />
          Owners Corner
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-500">A focused starting point for dealership oversight and owner-level administration.</p>
      </header>

      {isOwner ? (
        <>
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
            <p>Owner access is active. Each destination keeps its existing permissions and data controls.</p>
          </div>
          <OwnerWorkbookLibrary />
          <InventoryFlooringStatusReport />
          <PaidCommissionsTracker />
          <StaffTimeReport />
          <RecurringChecklists />
          <OwnersPerformanceReport />
          <section aria-label="Owner destinations" className="grid gap-4 md:grid-cols-3">
            {OWNER_DESTINATIONS.map(destination => (
              <NavLink
                key={destination.path}
                to={destination.path}
                className="group rounded-2xl border border-ink-700 bg-ink-900 p-5 shadow-sm transition-colors hover:border-amber-500/60"
              >
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600">
                  <destination.icon className="h-5 w-5" />
                </span>
                <h2 className="text-base font-bold text-ink-100 group-hover:text-amber-600">{destination.name}</h2>
                <p className="mt-1 text-sm leading-relaxed text-ink-500">{destination.description}</p>
              </NavLink>
            ))}
          </section>
        </>
      ) : (
        <section className="flex min-h-64 flex-col items-center justify-center rounded-2xl border border-dashed border-ink-700 bg-ink-900/60 px-6 text-center">
          <LockKeyhole className="mb-3 h-9 w-9 text-ink-500" />
          <h2 className="text-base font-bold text-ink-100">Owner access required</h2>
          <p className="mt-1 max-w-md text-sm text-ink-500">This workspace is available to Owner / Manager accounts. Your normal SPAS 360 destinations remain available from the menu.</p>
          <NavLink to="/dashboard" className="mt-5 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-600">
            Back to Dashboard
          </NavLink>
        </section>
      )}
    </div>
  );
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

function rangeLabel(range: OwnersReportRange) {
  return `${format(range.start, 'MMM d, yyyy')} – ${format(range.end, 'MMM d, yyyy')}`;
}

function yearPeriod(year: number): OwnersReportComparisonPeriod {
  return { year: String(year), startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

function initialComparison(): OwnersReportComparison {
  const year = new Date().getFullYear();
  return { firstPeriod: yearPeriod(year), comparedTo: yearPeriod(year - 1) };
}

function OwnersPerformanceReport() {
  const report = useOwnersReport();
  const [outcome, setOutcome] = useState<OwnersReportOutcome>('won');
  const [locationId, setLocationId] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [selectedPreset, setSelectedPreset] = useState<OwnersReportPreset>('this_month');
  const [appliedPreset, setAppliedPreset] = useState<OwnersReportPreset>('this_month');
  const [custom, setCustom] = useState<OwnersReportCustomRange>({ startDate: '', endDate: '' });
  const [appliedCustom, setAppliedCustom] = useState<OwnersReportCustomRange | null>(null);
  const [comparison, setComparison] = useState<OwnersReportComparison>(initialComparison);
  const [appliedComparison, setAppliedComparison] = useState<OwnersReportComparison | null>(null);
  const [isBuildingPdf, setIsBuildingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const appliedSelection = appliedPreset === 'compare_dates' ? appliedComparison : appliedCustom;
  const ranges = ownersReportRanges(appliedPreset, appliedSelection);
  const pendingCustomValid = !!ownersReportRanges('custom', custom);
  const pendingComparisonValid = !!ownersReportRanges('compare_dates', comparison);
  const currentDeals = useMemo(() => ranges ? closedDealsForRange(
    report.deals, ranges.current, outcome, locationId || null, assignedTo || null,
  ) : [], [report.deals, ranges, outcome, locationId, assignedTo]);
  const priorDeals = useMemo(() => ranges?.prior ? closedDealsForRange(
    report.deals, ranges.prior, outcome, locationId || null, assignedTo || null,
  ) : [], [report.deals, ranges, outcome, locationId, assignedTo]);
  const currentTotals = reportTotals(currentDeals);
  const priorTotals = reportTotals(priorDeals);
  const delta = reportDelta(currentTotals, priorTotals);
  const salespersonNames = useMemo(() => new Map(report.salespeople.map(option => [option.id, option.name])), [report.salespeople]);
  const storeNames = useMemo(() => new Map(report.stores.map(option => [option.id, option.name])), [report.stores]);
  const rateDeals = useMemo(() => report.deals.filter(deal =>
    (!locationId || deal.location_id === locationId) && (!assignedTo || deal.assigned_to === assignedTo),
  ), [report.deals, locationId, assignedTo]);
  const salespersonRates = useMemo(() => ranges ? closingRates(rateDeals, ranges.current, 'salesperson', salespersonNames) : [], [rateDeals, ranges, salespersonNames]);
  const storeRates = useMemo(() => ranges ? closingRates(rateDeals, ranges.current, 'store', storeNames) : [], [rateDeals, ranges, storeNames]);

  const pdfInputFor = (pdfRanges: OwnersReportRanges, preset: OwnersReportPreset): OwnersReportPdfInput => {
    const pdfCurrentDeals = closedDealsForRange(report.deals, pdfRanges.current, outcome, locationId || null, assignedTo || null);
    const pdfPriorDeals = pdfRanges.prior ? closedDealsForRange(report.deals, pdfRanges.prior, outcome, locationId || null, assignedTo || null) : [];
    const pdfCurrentTotals = reportTotals(pdfCurrentDeals);
    const pdfPriorTotals = reportTotals(pdfPriorDeals);
    const pdfRateDeals = report.deals.filter(deal =>
      (!locationId || deal.location_id === locationId) && (!assignedTo || deal.assigned_to === assignedTo));
    const wonDeals = closedDealsForRange(report.deals, pdfRanges.current, 'won', locationId || null, assignedTo || null);
    return {
      generatedAt: new Date(),
      outcome,
      store: locationId ? (storeNames.get(locationId) ?? 'Unknown store') : 'All Stores',
      salesperson: assignedTo ? (salespersonNames.get(assignedTo) ?? 'Unknown salesperson') : 'All Salespeople',
      dateSelection: OWNERS_REPORT_PRESET_LABELS[preset],
      current: {
        title: pdfRanges.prior ? 'First period' : 'Current period',
        range: rangeLabel(pdfRanges.current),
        deals: pdfCurrentDeals,
        totalCount: pdfCurrentTotals.count,
        totalAmount: pdfCurrentTotals.amount,
      },
      comparedTo: pdfRanges.prior ? {
        title: 'Compared to',
        range: rangeLabel(pdfRanges.prior),
        deals: pdfPriorDeals,
        totalCount: pdfPriorTotals.count,
        totalAmount: pdfPriorTotals.amount,
      } : undefined,
      delta: pdfRanges.prior ? reportDelta(pdfCurrentTotals, pdfPriorTotals) : undefined,
      salespersonRates: closingRates(pdfRateDeals, pdfRanges.current, 'salesperson', salespersonNames),
      storeRates: closingRates(pdfRateDeals, pdfRanges.current, 'store', storeNames),
      grossSalesRanking: salespersonGrossRanking(wonDeals, salespersonNames),
      storeNames,
      salespersonNames,
    };
  };

  const openPrintablePdf = async (pdfRanges: OwnersReportRanges, preset: OwnersReportPreset) => {
    setIsBuildingPdf(true);
    setPdfError(null);
    try {
      await viewOwnersReportPdf(pdfInputFor(pdfRanges, preset));
    } catch (error) {
      setPdfError(error instanceof Error ? error.message : 'The printable PDF could not be prepared.');
    } finally {
      setIsBuildingPdf(false);
    }
  };

  const applyPeriod = async () => {
    const pendingSelection = selectedPreset === 'custom' ? custom : selectedPreset === 'compare_dates' ? comparison : null;
    const nextRanges = ownersReportRanges(selectedPreset, pendingSelection);
    if (!nextRanges || report.isLoading) return;
    if (selectedPreset === 'custom') {
      setAppliedCustom(custom);
      setAppliedComparison(null);
    } else if (selectedPreset === 'compare_dates') {
      setAppliedComparison(comparison);
      setAppliedCustom(null);
    } else {
      setAppliedCustom(null);
      setAppliedComparison(null);
    }
    setAppliedPreset(selectedPreset);
    await openPrintablePdf(nextRanges, selectedPreset);
  };

  const viewPrintablePdf = async () => {
    if (!ranges || report.isLoading) return;
    await openPrintablePdf(ranges, appliedPreset);
  };

  return (
    <section aria-labelledby="owners-performance-heading" className="space-y-4 rounded-2xl border border-ink-700 bg-ink-900 p-5">
      <div>
        <h2 id="owners-performance-heading" className="text-lg font-bold text-ink-100">Sales Outcome &amp; Closing Rate</h2>
        <p className="mt-1 text-sm text-ink-500">Review closed results and lead-to-win performance from the same dealership data used by Pipeline.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-ink-400">Outcome
          <select aria-label="Closed outcome" value={outcome} onChange={event => setOutcome(event.target.value as OwnersReportOutcome)} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100">
            <option value="won">Closed-Won</option><option value="lost">Closed-Lost</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-400">Store
          <select aria-label="Owner report store" value={locationId} onChange={event => setLocationId(event.target.value)} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100">
            <option value="">All Stores</option>{report.stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-400">Salesperson
          <select aria-label="Owner report salesperson" value={assignedTo} onChange={event => setAssignedTo(event.target.value)} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100">
            <option value="">All Salespeople</option>{report.salespeople.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-ink-400">Date range
          <select aria-label="Owner report date range" value={selectedPreset} onChange={event => setSelectedPreset(event.target.value as OwnersReportPreset)} className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100">
            {(Object.keys(OWNERS_REPORT_PRESET_LABELS) as OwnersReportPreset[]).map(value => <option key={value} value={value}>{OWNERS_REPORT_PRESET_LABELS[value]}</option>)}
          </select>
        </label>
      </div>
      {selectedPreset === 'custom' && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-ink-950 p-3">
          <label className="text-xs font-semibold text-ink-400">Start date<input aria-label="Owner report start date" type="date" value={custom.startDate} onChange={event => setCustom(value => ({ ...value, startDate: event.target.value }))} className="mt-1 block rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100" /></label>
          <label className="text-xs font-semibold text-ink-400">End date<input aria-label="Owner report end date" type="date" value={custom.endDate} onChange={event => setCustom(value => ({ ...value, endDate: event.target.value }))} className="mt-1 block rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-100" /></label>
          {!pendingCustomValid && (custom.startDate || custom.endDate) && <p className="pb-2 text-xs text-red-400">Enter a valid start date on or before the end date.</p>}
        </div>
      )}
      {selectedPreset === 'compare_dates' && (
        <div className="grid gap-3 rounded-xl bg-ink-950 p-3">
          <ComparisonPeriodControls
            title="First comparison period"
            ariaPrefix="First comparison period"
            value={comparison.firstPeriod}
            onChange={firstPeriod => setComparison(value => ({ ...value, firstPeriod }))}
          />
          <ComparisonPeriodControls
            title="Compared to"
            ariaPrefix="Compared to period"
            value={comparison.comparedTo}
            onChange={comparedTo => setComparison(value => ({ ...value, comparedTo }))}
          />
          {!pendingComparisonValid && <p role="alert" className="text-xs text-red-400">Each period needs a valid start date on or before its end date, and both dates must be within the selected year.</p>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={applyPeriod} disabled={report.isLoading || isBuildingPdf || (selectedPreset === 'custom' && !pendingCustomValid) || (selectedPreset === 'compare_dates' && !pendingComparisonValid)} className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">Apply dates &amp; view PDF</button>
        <button type="button" onClick={viewPrintablePdf} disabled={report.isLoading || !ranges || isBuildingPdf} className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950 px-4 py-2 text-sm font-bold text-ink-100 hover:border-brand-500 disabled:cursor-not-allowed disabled:opacity-50">
          {isBuildingPdf ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          {isBuildingPdf ? 'Preparing PDF…' : 'View printable PDF'}
        </button>
      </div>
      {pdfError && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{pdfError}</p>}

      {report.error && <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">Report data could not load. ({report.error})</p>}
      {report.isLoading || !ranges ? <p className="py-8 text-center text-sm text-ink-500">Loading report…</p> : (
        <>
          <div className={`grid gap-3 ${ranges.prior ? 'sm:grid-cols-2 xl:grid-cols-3' : ''}`}>
            <OutcomeSummary title={ranges.prior ? 'First period' : 'Current period'} range={ranges.current} count={currentTotals.count} amount={currentTotals.amount} outcome={outcome} />
            {ranges.prior && <OutcomeSummary title="Compared to" range={ranges.prior} count={priorTotals.count} amount={priorTotals.amount} outcome={outcome} />}
            {ranges.prior && <ComparisonDelta count={delta.count} amount={delta.amount} outcome={outcome} />}
          </div>
          <div className="grid gap-4">
            <DealTable title={ranges.prior ? 'First period deals' : 'Matching deals'} deals={currentDeals} outcome={outcome} storeNames={storeNames} salespersonNames={salespersonNames} />
            {ranges.prior && <DealTable title="Compared to deals" deals={priorDeals} outcome={outcome} storeNames={storeNames} salespersonNames={salespersonNames} />}
          </div>

          <div className="pt-3">
            <h3 className="text-base font-bold text-ink-100">Closing Rate</h3>
            <p className="mt-1 text-xs text-ink-500">Deals assigned during {rangeLabel(ranges.current)}; rate is Closed-Won divided by assigned leads.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <ClosingRateTable title="By Salesperson" firstColumn="Salesperson" rows={salespersonRates} />
            <ClosingRateTable title="By Store" firstColumn="Store" rows={storeRates} />
          </div>
        </>
      )}
    </section>
  );
}

function ComparisonPeriodControls({ title, ariaPrefix, value, onChange }: { title: string; ariaPrefix: string; value: OwnersReportComparisonPeriod; onChange: (value: OwnersReportComparisonPeriod) => void }) {
  const minDate = /^\d{4}$/.test(value.year) ? `${value.year}-01-01` : undefined;
  const maxDate = /^\d{4}$/.test(value.year) ? `${value.year}-12-31` : undefined;
  return <fieldset className="rounded-xl border border-ink-700 bg-ink-900 p-3"><legend className="px-1 text-sm font-bold text-ink-100">{title}</legend><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold text-ink-400">Year<input aria-label={`${ariaPrefix} year`} type="number" min="1900" max="9999" inputMode="numeric" value={value.year} onChange={event => onChange({ ...value, year: event.target.value })} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100" /></label><label className="text-xs font-semibold text-ink-400">Start Date<input aria-label={`${ariaPrefix} start date`} type="date" min={minDate} max={maxDate} value={value.startDate} onChange={event => onChange({ ...value, startDate: event.target.value })} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100" /></label><label className="text-xs font-semibold text-ink-400">End Date<input aria-label={`${ariaPrefix} end date`} type="date" min={minDate} max={maxDate} value={value.endDate} onChange={event => onChange({ ...value, endDate: event.target.value })} className="mt-1 block w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-ink-100" /></label></div></fieldset>;
}

function DealTable({ title, deals, outcome, storeNames, salespersonNames }: { title: string; deals: ReturnType<typeof closedDealsForRange>; outcome: OwnersReportOutcome; storeNames: Map<string, string>; salespersonNames: Map<string, string> }) {
  return <div className="min-w-0 overflow-x-auto rounded-xl border border-ink-700"><h3 className="bg-ink-950 px-3 py-2 text-sm font-bold text-ink-100">{title}</h3><table className="w-full min-w-[620px] text-sm"><thead className="bg-ink-950 text-left text-xs uppercase tracking-wide text-ink-500"><tr><th className="px-3 py-2">Deal</th><th className="px-3 py-2">Closed</th><th className="px-3 py-2">Store</th><th className="px-3 py-2">Salesperson</th><th className="px-3 py-2 text-right">Amount</th></tr></thead><tbody>{deals.length ? deals.map(deal => <tr key={deal.id} className="border-t border-ink-800 text-ink-300"><td className="px-3 py-2 font-medium text-ink-100">{deal.title}</td><td className="px-3 py-2">{deal.closed_at ? format(new Date(deal.closed_at), 'MMM d, yyyy') : '—'}</td><td className="px-3 py-2">{storeNames.get(deal.location_id ?? '') ?? 'Unassigned'}</td><td className="px-3 py-2">{salespersonNames.get(deal.assigned_to ?? '') ?? 'Unassigned'}</td><td className="px-3 py-2 text-right">{money.format(Number(deal.amount) || 0)}</td></tr>) : <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-500">No {outcome === 'won' ? 'Closed-Won' : 'Closed-Lost'} deals match these filters.</td></tr>}</tbody></table></div>;
}

function OutcomeSummary({ title, range, count, amount, outcome }: { title: string; range: OwnersReportRange; count: number; amount: number; outcome: OwnersReportOutcome }) {
  return <article className="rounded-xl bg-ink-950 p-4"><p className="text-xs font-bold uppercase tracking-wide text-ink-500">{title}</p><p className="mt-1 text-sm text-ink-400">{rangeLabel(range)}</p><div className="mt-3 flex items-end justify-between"><div><p className="text-2xl font-bold text-ink-100">{count}</p><p className="text-xs text-ink-500">Closed-{outcome === 'won' ? 'Won' : 'Lost'} deals</p></div><p className="text-xl font-bold text-ink-100">{money.format(amount)}</p></div></article>;
}

function ComparisonDelta({ count, amount, outcome }: { count: number; amount: number; outcome: OwnersReportOutcome }) {
  const signedCount = count > 0 ? `+${count}` : String(count);
  const signedAmount = `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${money.format(Math.abs(amount))}`;
  return <article className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"><p className="text-xs font-bold uppercase tracking-wide text-amber-500">Comparison delta</p><p className="mt-1 text-sm text-ink-400">First period minus Compared to</p><div className="mt-3 flex items-end justify-between"><div><p className="text-2xl font-bold text-ink-100">{signedCount}</p><p className="text-xs text-ink-500">Closed-{outcome === 'won' ? 'Won' : 'Lost'} deals</p></div><p className="text-xl font-bold text-ink-100">{signedAmount}</p></div></article>;
}

function ClosingRateTable({ title, firstColumn, rows }: { title: string; firstColumn: string; rows: ReturnType<typeof closingRates> }) {
  return <div className="overflow-x-auto rounded-xl border border-ink-700"><h4 className="bg-ink-950 px-3 py-2 text-sm font-bold text-ink-100">{title}</h4><table className="w-full text-sm"><thead className="text-left text-xs text-ink-500"><tr><th className="px-3 py-2">{firstColumn}</th><th className="px-3 py-2 text-right">Assigned Leads</th><th className="px-3 py-2 text-right">Closed-Won</th><th className="px-3 py-2 text-right">Rate</th></tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.id} className="border-t border-ink-800 text-ink-300"><td className="px-3 py-2 font-medium text-ink-100">{row.name}</td><td className="px-3 py-2 text-right">{row.assigned}</td><td className="px-3 py-2 text-right">{row.won}</td><td className="px-3 py-2 text-right font-bold">{(row.rate * 100).toFixed(1)}%</td></tr>) : <tr><td colSpan={4} className="px-3 py-6 text-center text-ink-500">No assigned leads in this period.</td></tr>}</tbody></table></div>;
}
