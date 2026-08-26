import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Search, Phone, Mail, Users, Handshake, Wrench, Package, AlertTriangle, Snowflake, BadgeDollarSign, GripVertical, LayoutGrid, List } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn, formatPhone } from '@/lib/utils';
import { formatCustomerAddress } from '@/lib/customerAddress';
import { filterCustomersByNamePrefix, normalizeCustomerNameQuery } from '@/lib/customerSearch';
import { useCustomerCards, type CustomerCard, type CustomerSort } from '@/hooks/useCustomerCards';
import { useCustomerDrag } from '@/contexts/CustomerDragContext';
import NewCustomerWizard from '@/components/NewCustomerWizard';
import QuickDealModal from '@/components/QuickDealModal';
import { Skeleton, GridSkeleton } from '@/components/ui/Skeleton';

// The CRM pillar: every customer is a CARD. Read it top to bottom and you know
// the whole relationship — who they are, who owns them, what's in the pipeline,
// what they've bought, what's in service, and whether anyone is on the ball.
// Grab a card and drag it onto Deals in the top bar to work the pipeline.

const TYPE_BADGE: Record<string, string> = {
  Lead: 'bg-amber-500/15 text-amber-300',
  Prospect: 'bg-brand-500/15 text-brand-300',
  Customer: 'bg-emerald-500/15 text-emerald-300',
  'Past Customer': 'bg-ink-950 text-ink-300',
};

const SORTS: { value: CustomerSort; label: string }[] = [
  { value: 'recent', label: 'Recent activity' },
  { value: 'value', label: 'Highest value' },
  { value: 'name', label: 'Name A–Z' },
];

type ViewMode = 'cards' | 'list';
const VIEW_KEY = 'spas360.customersView';

export default function Customers() {
  const { cards, countsByType, isLoading, refresh } = useCustomerCards();
  const { dragging } = useCustomerDrag();
  const [showWizard, setShowWizard] = useState(false);
  const [quickDealFor, setQuickDealFor] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<CustomerSort>('recent');
  // List is the default; once someone chooses cards, remember that choice locally.
  const [view, setView] = useState<ViewMode>(() => (localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list'));
  const navigate = useNavigate();
  const location = useLocation();

  // ⌘K → "New Customer" arrives with the wizard flag
  useEffect(() => {
    if ((location.state as { openWizard?: boolean } | null)?.openWizard) {
      setShowWizard(true);
      navigate(location.pathname, { replace: true, state: null }); // consume the flag
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const switchView = (nextView: ViewMode) => {
    setView(nextView);
    localStorage.setItem(VIEW_KEY, nextView);
  };

  const normalizedSearch = normalizeCustomerNameQuery(search);
  const visible = useMemo(() => {
    const list = filterCustomersByNamePrefix(cards, search);
    const sorted = [...list];
    if (sort === 'name') sorted.sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
    else if (sort === 'value') sorted.sort((a, b) => (b.openDealValue + b.wonValue) - (a.openDealValue + a.wonValue));
    else sorted.sort((a, b) => b.lastActivity.localeCompare(a.lastActivity));
    return sorted;
  }, [cards, search, sort]);

  if (isLoading) {
    return (
      <div className="h-full max-w-[1600px] mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-2">
          <Skeleton className="h-8 w-16 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        <GridSkeleton />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-600">Relationships</p>
          <h1 className="mt-0.5 text-[22px] sm:text-[26px] leading-tight font-bold text-ink-100 tracking-tight">Customers</h1>
          <p className="hidden sm:block text-[13px] text-ink-400 mt-0.5">
            Drag any customer onto <span className="text-brand-300 font-medium">Deals</span> or <span className="text-emerald-300 font-medium">Schedule</span> up top to start work
          </p>
        </div>
        <button
          onClick={() => setShowWizard(true)}
          className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm"
        >
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </button>
      </div>

      {showWizard && <NewCustomerWizard onClose={() => setShowWizard(false)} onCreated={() => refresh()} />}
      {quickDealFor && (
        <QuickDealModal
          contactId={quickDealFor}
          onClose={() => setQuickDealFor(null)}
          onCreated={(dealId) => navigate('/deals', { state: { highlight: dealId } })}
        />
      )}

      {/* One default customer list, with the previously built cards retained as an optional view. */}
      <div className="flex flex-wrap items-center gap-2 mb-4 shrink-0">
        <span className="text-sm font-medium text-ink-400">{countsByType.All ?? cards.length} customers</span>
        {normalizedSearch && (
          <span className="text-xs font-semibold text-brand-500" aria-live="polite">
            {visible.length} exact-prefix {visible.length === 1 ? 'match' : 'matches'}
          </span>
        )}
        <div className="flex-1" />
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Start typing a customer name…"
            className="w-56 sm:w-64 pl-9 pr-3 py-2 bg-ink-900 border border-ink-700 rounded-lg text-sm outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
          />
        </div>
        <select
          value={sort}
          onChange={e => setSort(e.target.value as CustomerSort)}
          className="px-3 py-2 bg-ink-900 border border-ink-700 rounded-lg text-sm text-ink-300 outline-none focus:border-violet-500"
          aria-label="Sort customers"
        >
          {SORTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <div className="flex items-center bg-ink-900 border border-ink-700 rounded-lg p-0.5" aria-label="Customer view">
          <button
            type="button"
            onClick={() => switchView('cards')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'cards' ? 'bg-violet-500/20 text-violet-300' : 'text-ink-500 hover:text-ink-300')}
            title="Card view"
            aria-label="Card view"
            aria-pressed={view === 'cards'}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => switchView('list')}
            className={cn('p-1.5 rounded-md transition-colors', view === 'list' ? 'bg-violet-500/20 text-violet-300' : 'text-ink-500 hover:text-ink-300')}
            title="List view"
            aria-label="List view"
            aria-pressed={view === 'list'}
          >
            <List className="w-4 h-4" />
          </button>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-ink-500">
          <Users className="w-12 h-12 mb-3" />
          <p className="text-lg font-medium">No customers yet</p>
          <p className="text-sm mt-1">Add your first customer to start building the book</p>
          <button
            onClick={() => setShowWizard(true)}
            className="mt-4 bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Customer
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-ink-500">
          <Search className="w-10 h-10 mb-3" />
          <p className="text-sm">Nothing matches — try a different search</p>
        </div>
      ) : view === 'cards' ? (
        <div
          key={`cards:${normalizedSearch}`}
          className={cn('flex-1 overflow-y-auto pb-4 transition-opacity', dragging && 'opacity-80')}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
            {visible.map(c => (
              <CustomerCardView key={c.id} customer={c} onNewDeal={() => setQuickDealFor(c.id)} />
            ))}
          </div>
        </div>
      ) : (
        <div
          key={`list:${normalizedSearch}`}
          className={cn('flex-1 overflow-auto pb-4 bg-ink-900 rounded-xl border border-ink-700 transition-opacity', dragging && 'opacity-80')}
        >
          <table className="w-full min-w-[800px] table-fixed border-collapse text-left text-[10px]">
            <thead>
              <tr className="border-b border-ink-700 bg-ink-950 sticky top-0 z-10">
                <th className="w-[14%] px-1.5 py-2 text-[8px] font-semibold uppercase leading-tight tracking-wide text-ink-400">Customer</th>
                <th className="w-[17%] px-1.5 py-2 text-[8px] font-semibold uppercase leading-tight tracking-wide text-ink-400">Address</th>
                <th className="w-[13%] px-1.5 py-2 text-[8px] font-semibold uppercase leading-tight tracking-wide text-ink-400">Phone</th>
                <th className="w-[12%] px-1.5 py-2 text-right text-[8px] font-semibold uppercase leading-tight tracking-wide text-ink-400">In Play</th>
                <th className="w-[10%] px-1.5 py-2 text-right text-[8px] font-semibold uppercase leading-tight tracking-wide text-ink-400">Lifetime Spend</th>
                <th className="w-[17%] px-1.5 py-2 text-[8px] font-semibold uppercase leading-tight tracking-wide text-ink-400">Major Units Purchased</th>
                <th className="w-[9%] px-1.5 py-2 text-[8px] font-semibold uppercase leading-tight tracking-wide text-ink-400">Owner</th>
                <th className="w-[8%] px-1.5 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800">
              {visible.map(c => (
                <CustomerRow key={c.id} customer={c} onNewDeal={() => setQuickDealFor(c.id)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Shared health read for both views
function healthOf(c: CustomerCard) {
  const idleDays = Math.floor((Date.now() - new Date(c.lastActivity).getTime()) / (1000 * 60 * 60 * 24));
  const inPlay = c.customer_type === 'Lead' || c.customer_type === 'Prospect' || c.openDealCount > 0;
  return {
    idleDays,
    needsFollowUp: inPlay && !c.hasFollowUp,
    goingCold: inPlay && c.hasFollowUp && idleDays > 7,
  };
}

function CustomerRow({ customer: c, onNewDeal }: { customer: CustomerCard; onNewDeal: () => void }) {
  const { armDrag } = useCustomerDrag();
  const navigate = useNavigate();
  const assignedName = c.assigned ? `${c.assigned.first_name} ${c.assigned.last_name}` : null;
  const address = formatCustomerAddress(c.mailing_address);

  return (
    <tr
      onPointerDown={e => {
        if ((e.target as HTMLElement).closest('a, button')) return;
        armDrag({ id: c.id, first_name: c.first_name, last_name: c.last_name, customer_type: c.customer_type, phone: c.phone }, e);
      }}
      onClick={e => {
        if ((e.target as HTMLElement).closest('a, button')) return;
        navigate(`/customers/${c.id}`);
      }}
      className="hover:bg-ink-800 transition-colors cursor-grab"
    >
      <td className="px-1.5 py-2">
        <div className="flex min-w-0 items-center gap-1">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-violet-500/15 text-[8px] font-bold text-violet-300">
            {`${c.first_name[0] ?? ''}${c.last_name[0] ?? ''}`.toUpperCase()}
          </span>
          <span className="min-w-0" title={`${c.first_name} ${c.last_name} · ${c.customer_type}`}>
            <span className="block truncate text-[10px] font-medium text-ink-100">{c.first_name} {c.last_name}</span>
            <span className={cn('inline-block rounded-full px-1 py-px text-[8px] font-semibold', TYPE_BADGE[c.customer_type] ?? 'bg-ink-950 text-ink-300')}>
              {c.customer_type}
            </span>
          </span>
        </div>
      </td>
      <td className="px-1.5 py-2 text-ink-400">
        <span className="block truncate" title={address === 'Not provided' ? undefined : address}>
          {address}
        </span>
      </td>
      <td className="px-1.5 py-2">
        <a href={`tel:${c.phone}`} title={formatPhone(c.phone)} className="block truncate whitespace-nowrap text-[10px] text-ink-300 hover:text-brand-300">{formatPhone(c.phone)}</a>
      </td>
      <td className="px-1.5 py-2 text-right font-mono text-[10px] font-bold text-ink-100">
        ${(c.openDealValue + c.serviceAmount).toLocaleString()}
        {c.openDealCount > 0 && <span className="text-[10px] font-medium text-ink-500 ml-1">({c.openDealCount})</span>}
        {c.serviceLevel != null && (
          <span
            className="mt-0.5 block whitespace-nowrap rounded bg-amber-500/10 px-1 py-px text-[8px] font-bold text-amber-300"
            title={`Active service job, invoice not yet estimated — level ${c.serviceLevel} of 3 expected cost`}
          >
            In service
          </span>
        )}
      </td>
      {/* A book full of green $0s reads as noise. Reserve color and dollars for real spend. */}
      <td className={cn('px-1.5 py-2 text-right font-mono text-[10px] font-bold', c.wonValue > 0 ? 'text-emerald-300' : 'text-ink-500')}>
        {c.wonValue > 0 ? `$${c.wonValue.toLocaleString()}` : <span aria-label="No lifetime spend">—</span>}
      </td>
      <td className="px-1.5 py-2">
        {c.majorUnits.length > 0 ? (
          <ul className="space-y-1">
            {c.majorUnits.map(unit => (
              <li key={unit.id} className="min-w-0 leading-tight" title={`${unit.make} · ${unit.model} · Serial: ${unit.serialNumber}`}>
                <span className="block truncate text-[9px] font-medium text-ink-200">{unit.make} · {unit.model}</span>
                <span className="block truncate text-[8px] text-ink-500">Serial: {unit.serialNumber}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-sm text-ink-600" aria-label="No major units purchased">—</span>
        )}
      </td>
      <td className="truncate px-1.5 py-2 text-ink-400" title={assignedName ?? 'Unassigned'}>{assignedName ?? 'Unassigned'}</td>
      <td className="px-1.5 py-2 text-right">
        <div className="flex flex-wrap items-center justify-end gap-0.5">
          {c.openJobCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold" title={`${c.openJobCount} open service job(s)`}>
              <Wrench className="w-3 h-3" />{c.openJobCount}
            </span>
          )}
          {c.equipmentCount > 0 && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-300 text-[10px] font-semibold" title={`${c.equipmentCount} unit(s) owned`}>
              <Package className="w-3 h-3" />{c.equipmentCount}
            </span>
          )}
          <button
            onClick={onNewDeal}
            className="p-1.5 rounded-lg text-ink-500 hover:text-brand-300 hover:bg-brand-500/10 transition-colors"
            title="New deal for this customer" aria-label={`New deal for ${c.first_name} ${c.last_name}`}
          >
            <Handshake className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CustomerCardView({ customer: c, onNewDeal }: { customer: CustomerCard; onNewDeal: () => void }) {
  const { armDrag } = useCustomerDrag();
  const navigate = useNavigate();
  const initials = `${c.first_name[0] ?? ''}${c.last_name[0] ?? ''}`.toUpperCase();
  const assignedName = c.assigned ? `${c.assigned.first_name} ${c.assigned.last_name}` : null;
  const { idleDays, needsFollowUp, goingCold } = healthOf(c);

  return (
    <div
      onPointerDown={e => {
        // Links/buttons inside the card keep their own behavior
        if ((e.target as HTMLElement).closest('a, button, select, input')) return;
        armDrag({ id: c.id, first_name: c.first_name, last_name: c.last_name, customer_type: c.customer_type, phone: c.phone }, e);
      }}
      onClick={e => {
        if ((e.target as HTMLElement).closest('a, button, select, input')) return;
        navigate(`/customers/${c.id}`);
      }}
      className="group bg-ink-900 rounded-xl border border-ink-700 p-4 cursor-grab hover:border-violet-500/40 transition-all touch-manipulation"
    >
      {/* Identity */}
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-full bg-violet-500/15 text-violet-300 flex items-center justify-center text-sm font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-100 text-[15px] leading-snug truncate group-hover:text-violet-300 transition-colors">
            {c.first_name} {c.last_name}
          </p>
          <span className={cn('inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-semibold', TYPE_BADGE[c.customer_type] ?? 'bg-ink-950 text-ink-300')}>
            {c.customer_type}
          </span>
        </div>
        <GripVertical className="w-4 h-4 text-ink-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
      </div>

      {/* Reach */}
      <div className="space-y-1 mb-3">
        <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 text-xs text-ink-300 hover:text-brand-300 w-fit">
          <Phone className="w-3 h-3 text-ink-500 shrink-0" />{formatPhone(c.phone)}
        </a>
        {c.email && (
          <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-brand-300 w-fit min-w-0">
            <Mail className="w-3 h-3 text-ink-500 shrink-0" /><span className="truncate">{c.email}</span>
          </a>
        )}
      </div>

      {/* Relationship value — mono numerals like the sales board */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-ink-950 rounded-lg px-2.5 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-500">In play</p>
          <p className="font-mono text-sm font-bold text-ink-100">
            ${(c.openDealValue + c.serviceAmount).toLocaleString()}
            {c.openDealCount > 0 && <span className="text-[10px] font-medium text-ink-500 ml-1">({c.openDealCount})</span>}
          </p>
          {c.serviceLevel != null && (
            <p
              className="text-[9px] font-bold text-amber-300/90 mt-0.5"
              title={`Active service job, invoice not yet estimated — level ${c.serviceLevel} of 3 expected cost`}
            >
              + service · L{c.serviceLevel}
            </p>
          )}
        </div>
        <div className="bg-ink-950 rounded-lg px-2.5 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-ink-500">Lifetime</p>
          <p className="font-mono text-sm font-bold text-emerald-300">${c.wonValue.toLocaleString()}</p>
        </div>
      </div>

      {/* What they own / what's in service */}
      {(c.equipmentCount > 0 || c.openJobCount > 0) && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {c.equipmentCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-brand-500/10 text-brand-300 text-[10px] font-semibold">
              <Package className="w-3 h-3" />{c.equipmentCount} owned
            </span>
          )}
          {c.openJobCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 text-[10px] font-semibold">
              <Wrench className="w-3 h-3" />{c.openJobCount} in service
              {c.serviceAmount > 0 && <span className="text-emerald-200/90">· ${c.serviceAmount.toLocaleString()}</span>}
              {c.serviceLevel != null && <span className="text-amber-300/90">· L{c.serviceLevel}</span>}
            </span>
          )}
        </div>
      )}

      {/* Health + ownership */}
      <div className="flex items-center justify-between gap-2 text-[11px] border-t border-ink-800 pt-2.5">
        <span className="flex items-center gap-1 text-ink-500 min-w-0">
          <BadgeDollarSign className="w-3 h-3 shrink-0 text-brand-400" />
          <span className="truncate">{assignedName ?? 'Unassigned'}</span>
        </span>
        {needsFollowUp ? (
          <span className="flex items-center gap-1 text-red-400 font-semibold shrink-0">
            <AlertTriangle className="w-3 h-3" />No follow-up
          </span>
        ) : goingCold ? (
          <span className="flex items-center gap-1 text-amber-400 font-semibold shrink-0">
            <Snowflake className="w-3 h-3" />{idleDays}d quiet
          </span>
        ) : (
          <span className="text-ink-500 shrink-0">{formatDistanceToNow(new Date(c.lastActivity), { addSuffix: true })}</span>
        )}
      </div>

      {/* Quick action — the touch-friendly path to the pipeline */}
      <button
        onClick={onNewDeal}
        className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-700 text-[12px] font-semibold text-ink-400 hover:text-brand-300 hover:border-brand-500/40 hover:bg-brand-500/10 transition-colors"
      >
        <Handshake className="w-3.5 h-3.5" />
        New Deal
      </button>
    </div>
  );
}
