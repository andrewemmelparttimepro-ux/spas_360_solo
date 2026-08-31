import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Plus, MoreHorizontal, CalendarClock, AlertTriangle, User, Snowflake, Link2, X, Search, UsersRound, List, Columns3, Flag } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { usePipeline, type PipelineDeal } from '@/hooks/usePipeline';
import { filterDealsByFollowUp, formatFollowUpDue, getFollowUpState, type DealFollowUp, type FollowUpFilter, type FollowUpState } from '@/lib/followUp';
import { useCustomerDrag, type DragCustomer } from '@/contexts/CustomerDragContext';
import SalesBoard from '@/components/SalesBoard';
import QuickDealModal from '@/components/QuickDealModal';
import { Skeleton, StatsSkeleton, BoardSkeleton } from '@/components/ui/Skeleton';
import DialogKeys from '@/components/ui/DialogKeys';
import { activePipelineStages, isActiveDeal, outcomeStage } from '@/lib/dealStage';
import {
  ALL_DEAL_OWNERS,
  matchesDealOwnerFilter,
  UNASSIGNED_DEAL_OWNER,
  type DealOwnerFilter,
} from '@/lib/dealOwnerFilter';
import type { DealPriority } from '@/types/database';
import { formatDealCreated } from '@/lib/dealCreated';

export default function Deals() {
  const { stages, deals, salespeople, followUpsByDeal, isLoading, moveDeal, moveDealToStage, refresh } = usePipeline();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { dragging, activeTarget, setDropHandler } = useCustomerDrag();
  // Customer card dropped from the CRM: onto a deal → attach, onto a stage → new deal
  const [attach, setAttach] = useState<{ customer: DragCustomer; dealId: string } | null>(null);
  const [quickDeal, setQuickDeal] = useState<{ contactId?: string; stageId?: string } | null>(null);
  // IKEA effect: spotlight the customer card the salesperson just built
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState<DealOwnerFilter>(ALL_DEAL_OWNERS);
  const [priorityFilter, setPriorityFilter] = useState<DealPriority | 'all'>('all');
  const [dealSearch, setDealSearch] = useState('');
  const [followUpFilter, setFollowUpFilter] = useState<FollowUpFilter>('all');
  // One pipeline view at a time: the follow-up list (Brandon's HubSpot muscle
  // memory) leads; the drag board is one click away, never stacked below.
  const [view, setView] = useState<'list' | 'board'>(() =>
    localStorage.getItem('spas360.dealsView') === 'board' ? 'board' : 'list');
  const switchView = (next: 'list' | 'board') => {
    setView(next);
    localStorage.setItem('spas360.dealsView', next);
  };
  const effectiveView = dragging ? 'board' : view;
  const [movingDealId, setMovingDealId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isManager = profile?.role === 'owner_manager' || profile?.role === 'service_manager';

  useEffect(() => {
    if (profile && !isManager) setOwnerFilter(profile.id);
  }, [profile, isManager]);

  // Created from the dashboard's "+ New" → arrive here with the new card pulsing.
  // A customer card dropped straight on the Deals pill arrives as customerDrop.
  useEffect(() => {
    const st = location.state as { highlight?: string; customerDrop?: string } | null;
    if (st?.highlight) {
      setHighlightId(st.highlight);
      setTimeout(() => setHighlightId(null), 4000);
    }
    if (st?.customerDrop) {
      setQuickDeal({ contactId: st.customerDrop });
    }
    if (st?.highlight || st?.customerDrop) {
      navigate(location.pathname, { replace: true, state: null }); // consume the flag
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  // While a customer card is in flight, this page owns the drop targets
  useEffect(() => {
    setDropHandler((target, customer) => {
      if (target.kind === 'deal') setAttach({ customer, dealId: target.dealId });
      else setQuickDeal({ contactId: customer.id, stageId: target.stageId });
    });
    return () => setDropHandler(null);
  }, [setDropHandler]);

  const spotlight = useCallback((dealId: string) => {
    setHighlightId(dealId);
    setTimeout(() => setHighlightId(null), 4000);
  }, []);

  const confirmAttach = useCallback(async () => {
    if (!attach || !profile) return;
    const deal = deals.find(d => d.id === attach.dealId);
    if (!deal) { setAttach(null); return; }
    const { customer } = attach;
    const { error } = await supabase.from('deals').update({ contact_id: customer.id }).eq('id', deal.id);
    if (error) {
      toast(`Couldn't attach customer: ${error.message}`, 'error');
      setAttach(null);
      return;
    }
    // Customer Notes are reserved for humans — the attach itself lands in the
    // audit ledger, not the customer-facing timeline (customerNotes contract).
    toast(`${customer.first_name} attached to “${deal.title}”`, 'success');
    setAttach(null);
    spotlight(deal.id);
    refresh();
  }, [attach, deals, profile, toast, refresh, spotlight]);

  if (isLoading) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <StatsSkeleton />
        <BoardSkeleton />
      </div>
    );
  }

  const attachDeal = attach ? deals.find(d => d.id === attach.dealId) : null;
  const searchNeedle = dealSearch.trim().toLowerCase();
  const matchesDealFilters = (deal: PipelineDeal) => {
    if (!matchesDealOwnerFilter(deal, stages, ownerFilter)) return false;
    if (priorityFilter !== 'all' && deal.priority !== priorityFilter) return false;
    if (!searchNeedle) return true;
    const contactName = deal.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name}` : '';
    const ownerName = deal.assigned ? `${deal.assigned.first_name} ${deal.assigned.last_name}` : '';
    return `${deal.title} ${contactName} ${ownerName}`.toLowerCase().includes(searchNeedle);
  };
  const visibleDeals = deals.filter(matchesDealFilters);
  const editableStages = activePipelineStages(stages);
  const wonStage = outcomeStage(stages, 'won');
  const lostStage = outcomeStage(stages, 'lost');
  const activeDeals = visibleDeals
    .filter(deal => isActiveDeal(deal, stages))
    .sort((a, b) => {
      const stateRank: Record<FollowUpState, number> = { overdue: 0, missing: 1, today: 2, scheduled: 3 };
      const aFollowUp = followUpsByDeal.get(a.id);
      const bFollowUp = followUpsByDeal.get(b.id);
      const stateDifference = stateRank[getFollowUpState(aFollowUp)] - stateRank[getFollowUpState(bFollowUp)];
      if (stateDifference !== 0) return stateDifference;
      const aDue = aFollowUp ? new Date(aFollowUp.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const bDue = bFollowUp ? new Date(bFollowUp.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;
      return Number(b.amount ?? 0) - Number(a.amount ?? 0);
    });
  const followUpNow = new Date();
  const missingFollowUps = activeDeals.filter(deal => getFollowUpState(followUpsByDeal.get(deal.id), followUpNow) === 'missing').length;
  const overdueFollowUps = activeDeals.filter(deal => getFollowUpState(followUpsByDeal.get(deal.id), followUpNow) === 'overdue').length;
  const dueToday = activeDeals.filter(deal => getFollowUpState(followUpsByDeal.get(deal.id), followUpNow) === 'today').length;
  const filteredActiveDeals = filterDealsByFollowUp(activeDeals, followUpsByDeal, followUpFilter, followUpNow);

  const handleDealDrop = async (result: DropResult) => {
    const destinationStage = stages.find(stage => stage.id === result.destination?.droppableId);
    if (destinationStage?.is_won) {
      navigate(`/deals/${result.draggableId}`, {
        state: { openClosedWon: true, source: 'deals-board' },
      });
      return;
    }
    await moveDeal(result);
  };

  const changeDealStage = async (deal: PipelineDeal, stageId: string) => {
    if (movingDealId || deal.stage_id === stageId) return;
    setMovingDealId(deal.id);
    try {
      await moveDealToStage(deal.id, stageId);
    } finally {
      setMovingDealId(null);
    }
  };

  const filterControls = (
    <div className="flex flex-wrap items-center gap-2">
      {isManager ? (
        <label className="relative">
          <UsersRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
          <select
            value={ownerFilter}
            onChange={(event) => setOwnerFilter(event.target.value)}
            aria-label="Filter by salesperson"
            className="appearance-none rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-8 text-sm text-ink-100 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          >
            <option value={ALL_DEAL_OWNERS}>All Salespeople</option>
            <option value={UNASSIGNED_DEAL_OWNER}>Unassigned</option>
            {salespeople.map(person => (
              <option key={person.id} value={person.id}>{person.first_name} {person.last_name}</option>
            ))}
          </select>
        </label>
      ) : (
        <span className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-900 px-3 py-2 text-sm text-ink-300">
          <UsersRound className="h-4 w-4 text-ink-500" /> My deals
        </span>
      )}
      <label className="relative">
        <Flag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <select
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as DealPriority | 'all')}
          aria-label="Filter by priority"
          className="appearance-none rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-8 text-sm text-ink-100 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        >
          <option value="all">All priorities</option>
          <option value="High">Priority High</option>
          <option value="Medium">Priority Medium</option>
          <option value="Low">Priority Low</option>
        </select>
      </label>
      <label className="relative min-w-[220px] flex-1 sm:flex-none">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
        <input
          value={dealSearch}
          onChange={(event) => setDealSearch(event.target.value)}
          placeholder="Search active deals"
          aria-label="Search active deals"
          className="w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-3 text-sm text-ink-100 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
        />
      </label>
    </div>
  );

  return (
    <div className="max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-600">Sales</p>
          <h1 className="mt-0.5 text-[22px] sm:text-[26px] leading-tight font-bold text-ink-100 tracking-tight">Deals</h1>
          <p className="hidden sm:block text-[13px] text-ink-400 mt-0.5">Every customer, every stage — live</p>
        </div>
        <div className="flex items-center gap-3">
          {/* A customer drag in flight needs stage columns to land on, so the board takes over */}
          <div className="flex items-center rounded-lg border border-ink-700 bg-ink-950 p-0.5" role="group" aria-label="Pipeline view">
            <button
              type="button"
              onClick={() => switchView('list')}
              aria-pressed={effectiveView === 'list'}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                effectiveView === 'list' ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-400 hover:text-ink-200',
              )}
            >
              <List className="h-3.5 w-3.5" /> List
            </button>
            <button
              type="button"
              onClick={() => switchView('board')}
              aria-pressed={effectiveView === 'board'}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors',
                effectiveView === 'board' ? 'bg-brand-500 text-white shadow-sm' : 'text-ink-400 hover:text-ink-200',
              )}
            >
              <Columns3 className="h-3.5 w-3.5" /> Board
            </button>
          </div>
          <button onClick={() => setQuickDeal({})} className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
            <Plus className="w-4 h-4 mr-2" />
            New Deal
          </button>
        </div>
      </div>

      <div aria-label="Deal filters" className="mb-4 rounded-xl border border-ink-700 bg-ink-950/70 p-3 shadow-sm">
        {filterControls}
      </div>

      {quickDeal && (
        <QuickDealModal
          contactId={quickDeal.contactId}
          stageId={quickDeal.stageId}
          onClose={() => setQuickDeal(null)}
          onCreated={(dealId) => { refresh(); spotlight(dealId); }}
        />
      )}

      {/* Confirm before rewiring a deal to a different customer — deals always have one */}
      {attach && attachDeal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div role="dialog" aria-modal="true" aria-label="Attach customer to deal" className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl w-full max-w-md">
            <DialogKeys onClose={() => setAttach(null)} />
            <div className="px-6 pt-5 pb-4 border-b border-ink-700 flex items-start justify-between">
              <h2 className="text-lg font-bold text-ink-100 flex items-center gap-2">
                <Link2 className="w-5 h-5 text-violet-400" />
                Attach customer to deal
              </h2>
              <button onClick={() => setAttach(null)} className="p-1 text-ink-500 hover:text-ink-300" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-sm text-ink-300">
                Attach <span className="font-semibold text-violet-300">{attach.customer.first_name} {attach.customer.last_name}</span> to
                <span className="font-semibold text-ink-100"> “{attachDeal.title}”</span>?
              </p>
              {attachDeal.contacts && (
                <p className="text-xs text-amber-400/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-3 py-2">
                  This deal currently belongs to <strong>{attachDeal.contacts.first_name} {attachDeal.contacts.last_name}</strong> — they'll be replaced, and the change is logged on the deal.
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-ink-700 flex justify-end gap-3">
              <button onClick={() => setAttach(null)} className="px-4 py-2 text-sm text-ink-400 hover:text-ink-200">Cancel</button>
              <button onClick={confirmAttach} className="px-4 py-2 text-sm bg-violet-500 hover:bg-violet-600 text-white rounded-lg font-medium transition-colors">
                Attach Customer
              </button>
            </div>
          </div>
        </div>
      )}

      {effectiveView === 'list' && (
      <div className="mb-5 shrink-0 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/90 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink-700 bg-ink-950/80 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-100">Active leads and their next activity</h2>
            <p className="mt-0.5 text-[13px] text-ink-400">Missing and overdue follow-ups rise to the top automatically.</p>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-ink-800 border-b border-ink-800 bg-ink-950/40 sm:grid-cols-4">
          <FollowUpStat label="Active leads" value={activeDeals.length} tone="neutral" filter="all" selected={followUpFilter === 'all'} onSelect={setFollowUpFilter} />
          <FollowUpStat label="No next activity" value={missingFollowUps} tone={missingFollowUps ? 'danger' : 'good'} filter="missing" selected={followUpFilter === 'missing'} onSelect={setFollowUpFilter} />
          <FollowUpStat label="Overdue" value={overdueFollowUps} tone={overdueFollowUps ? 'danger' : 'good'} filter="overdue" selected={followUpFilter === 'overdue'} onSelect={setFollowUpFilter} />
          <FollowUpStat label="Due today" value={dueToday} tone={dueToday ? 'warning' : 'neutral'} filter="today" selected={followUpFilter === 'today'} onSelect={setFollowUpFilter} />
        </div>
        <div
          id="active-deals-table"
          className="max-h-[68vh] overflow-auto"
          role="region"
          aria-label="Active deals table"
          tabIndex={0}
        >
          <table className="w-full min-w-[900px] table-fixed divide-y divide-ink-800 text-[11px]">
            <thead className="sticky top-0 z-10 bg-ink-950 text-left text-[9px] font-semibold uppercase leading-tight tracking-[0.08em] text-ink-500">
              <tr>
                <th className="w-[11%] px-1.5 py-2">Deal</th>
                <th className="w-[9%] px-1.5 py-2">Customer</th>
                <th className="w-[10%] px-1.5 py-2">Stage</th>
                <th className="w-[8%] px-1.5 py-2">Deal owner</th>
                <th className="w-[13%] px-1.5 py-2">Next activity</th>
                <th className="w-[8%] px-1.5 py-2">Amount</th>
                <th className="w-[7%] px-1.5 py-2">Priority</th>
                <th className="w-[11%] px-1.5 py-2">Deal Created</th>
                <th className="w-[10%] px-1.5 py-2">Expected Close</th>
                <th className="w-[5%] px-1.5 py-2">Open tasks</th>
                <th className="w-[8%] px-1 py-2">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800/80">
              {filteredActiveDeals.map((deal) => {
                const contactName = deal.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name}` : 'Unassigned';
                const ownerName = deal.assigned ? `${deal.assigned.first_name} ${deal.assigned.last_name}` : 'Unassigned';
                const followUp = followUpsByDeal.get(deal.id);
                const followUpState = getFollowUpState(followUp);
                const stageName = editableStages.find(entry => entry.id === deal.stage_id)?.name ?? 'Unknown stage';
                return (
                  <tr key={deal.id} className="bg-ink-900/70 hover:bg-brand-500/5">
                    <td className="group/deal-link px-1.5 py-2">
                      <Link
                        to={`/deals/${deal.id}`}
                        title={deal.title}
                        className="block truncate font-medium text-ink-100 transition-colors group-hover/deal-link:text-brand-400 focus-visible:text-brand-400"
                      >
                        {deal.title}
                      </Link>
                    </td>
                    <td className="truncate px-1.5 py-2 text-ink-300" title={contactName}>{contactName}</td>
                    <td className="px-1.5 py-2">
                      <select
                        value={deal.stage_id}
                        onChange={(event) => changeDealStage(deal, event.target.value)}
                        disabled={movingDealId !== null}
                        aria-label={`Stage for ${deal.title}`}
                        title={stageName}
                        className="w-full rounded-md border border-ink-700 bg-ink-950 px-1.5 py-1 text-[10px] font-semibold text-ink-200 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:cursor-wait disabled:opacity-60"
                      >
                        {editableStages.map(entry => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                      </select>
                    </td>
                    <td className="truncate px-1.5 py-2 text-ink-300" title={ownerName}>{ownerName}</td>
                    <td className="px-1.5 py-2">
                      {followUp ? (
                        <Link
                          to={`/deals/${deal.id}`}
                          title={`${formatFollowUpDue(followUp)}: ${followUp.title}`}
                          className={cn('block rounded-md border px-1.5 py-1 transition hover:brightness-110', followUpTone[followUpState])}
                        >
                          <span className="block truncate text-[10px] font-semibold">{formatFollowUpDue(followUp)}</span>
                          <span className="mt-0.5 block truncate text-[9px] opacity-80">{followUp.title}</span>
                        </Link>
                      ) : (
                        <Link to={`/deals/${deal.id}`} className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-1.5 py-1 text-[9px] font-semibold text-red-300 transition hover:bg-red-500/15">
                          <AlertTriangle className="h-3 w-3 shrink-0" /> Set next task
                        </Link>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-1.5 py-2 font-mono text-[10px] text-ink-100">${(Number(deal.amount) || 0).toLocaleString()}</td>
                    <td className="px-1.5 py-2">
                      <span className={cn(
                        'rounded-full border px-1 py-0.5 text-[9px] font-medium',
                        deal.priority === 'High' ? 'border-red-500/30 bg-red-500/10 text-red-300'
                          : deal.priority === 'Medium' ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                          : 'border-ink-700 bg-ink-950 text-ink-300',
                      )}>{deal.priority}</span>
                    </td>
                    <td className="whitespace-nowrap px-1.5 py-2 text-[10px] text-ink-400" title={deal.created_at}>{formatDealCreated(deal.created_at)}</td>
                    <td className="whitespace-nowrap px-1.5 py-2 text-[10px] text-ink-400">{deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : '—'}</td>
                    <td className="px-1.5 py-2 text-center font-mono text-[10px] text-ink-300">{followUp?.openTaskCount ?? 0}</td>
                    <td className="px-1 py-2">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => wonStage && navigate(`/deals/${deal.id}`, {
                            state: { openClosedWon: true, source: 'deals-list' },
                          })}
                          disabled={!wonStage}
                          aria-label={`Mark ${deal.title} won`}
                          className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-1 py-1.5 text-[10px] font-bold text-emerald-300 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Won
                        </button>
                        <button
                          type="button"
                          onClick={() => lostStage && changeDealStage(deal, lostStage.id)}
                          disabled={!lostStage || movingDealId !== null}
                          aria-label={`Mark ${deal.title} lost`}
                          className="rounded-md border border-red-500/35 bg-red-500/10 px-1 py-1.5 text-[10px] font-bold text-red-300 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Lost
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredActiveDeals.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-5 py-10 text-center text-sm text-ink-500">
                    No active deals match the selected follow-up, salesperson, priority, and search filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {effectiveView === 'board' && (<>
      {/* The live board, realtime scoreboard above the pipeline */}
      <SalesBoard deals={visibleDeals} stages={stages} followUpsByDeal={followUpsByDeal} />

      <div className="overflow-x-auto pb-4" data-cdrop-scroll>
        <DragDropContext onDragEnd={handleDealDrop}>
          <div className="flex space-x-4 items-start">
            {stages.map(stage => {
              const stageDeals = visibleDeals.filter(deal => deal.stage_id === stage.id);
              const closed = stage.is_won || stage.is_lost;
              // Closed stages don't take customer drops — new deals start live
              const stageDropProps = !closed ? { 'data-cdrop': 'stage', 'data-cdrop-stage': stage.id } : {};
              const stageIsOver = activeTarget === `stage:${stage.id}`;
              return (
                <div
                  key={stage.id}
                  {...stageDropProps}
                  className={cn(
                    'w-72 flex-shrink-0 flex flex-col bg-ink-950/60 rounded-xl border border-ink-700 max-h-[calc(100dvh-16rem)] transition-all',
                    dragging && !closed && 'border-violet-500/30',
                    stageIsOver && 'border-violet-400 ring-2 ring-violet-400/50 bg-violet-500/10'
                  )}
                >
                  <div className="p-3 border-b border-ink-700 flex items-center justify-between bg-ink-950 rounded-t-xl">
                    <h3 className="font-semibold text-ink-300 text-xs uppercase tracking-wider">{stage.name}</h3>
                    <span className="bg-ink-700 text-ink-300 text-xs font-medium px-2 py-0.5 rounded-full">{stageDeals.length}</span>
                  </div>
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn('flex-1 p-3 overflow-y-auto min-h-[100px] space-y-3 transition-colors', snapshot.isDraggingOver ? 'bg-brand-500/10' : '')}
                      >
                        {stageDeals.map((deal, index) => (
                          <DealCard
                            key={deal.id}
                            deal={deal}
                            index={index}
                            followUp={followUpsByDeal.get(deal.id)}
                            closed={closed}
                            highlight={deal.id === highlightId}
                          />
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>
                </div>
              );
            })}
          </div>
        </DragDropContext>
      </div>
      </>)}
    </div>
  );
}

const priorityEdge: Record<string, string> = {
  High: 'border-l-red-500',
  Medium: 'border-l-amber-500',
  Low: 'border-l-brand-500',
};

const followUpTone: Record<FollowUpState, string> = {
  missing: 'border-red-500/30 bg-red-500/10 text-red-300',
  overdue: 'border-red-500/30 bg-red-500/10 text-red-300',
  today: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  scheduled: 'border-brand-500/30 bg-brand-500/10 text-brand-300',
};

function FollowUpStat({
  label,
  value,
  tone,
  filter,
  selected,
  onSelect,
}: {
  label: string;
  value: number;
  tone: 'neutral' | 'danger' | 'warning' | 'good';
  filter: FollowUpFilter;
  selected: boolean;
  onSelect: (filter: FollowUpFilter) => void;
}) {
  const tones = {
    neutral: 'text-ink-100',
    danger: 'text-red-300',
    warning: 'text-amber-300',
    good: 'text-emerald-300',
  };

  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-controls="active-deals-table"
      onClick={() => onSelect(filter)}
      className={cn(
        'w-full px-4 py-3 text-left outline-none transition hover:bg-brand-500/10 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400',
        selected && 'bg-brand-500/15 ring-1 ring-inset ring-brand-500/50',
      )}
    >
      <p className={cn('font-mono text-xl font-bold', tones[tone])}>{value}</p>
      <p className={cn('mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em]', selected ? 'text-brand-300' : 'text-ink-500')}>{label}</p>
    </button>
  );
}

function DealCard({ deal, index, followUp, closed, highlight }: { deal: PipelineDeal; index: number; followUp?: DealFollowUp; closed?: boolean; highlight?: boolean }) {
  const { activeTarget } = useCustomerDrag();
  const daysInStage = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24));
  const goingCold = !closed && daysInStage > 7; // loss framing: idle deals are money walking away
  const contactName = deal.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name}` : null;
  const interests = (deal.product_interest ?? []).slice(0, 3);
  const customerIsOver = activeTarget === `deal:${deal.id}`;
  const followUpState = getFollowUpState(followUp);

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
          data-cdrop="deal" data-cdrop-deal={deal.id}
          className={cn(
            'bg-ink-900 p-3.5 rounded-lg border border-ink-700 border-l-[3px] group hover:border-brand-500/40 transition-all',
            priorityEdge[deal.priority] ?? 'border-l-ink-600',
            snapshot.isDragging ? 'shadow-lg ring-2 ring-brand-500/50' : '',
            highlight && 'ring-2 ring-brand-400 shadow-[0_0_24px_rgba(52,160,255,0.4)] animate-pulse',
            customerIsOver && 'ring-2 ring-violet-400 border-violet-400 scale-[1.02] shadow-[0_0_20px_rgba(167,139,250,0.35)]'
          )}>
          <div className="flex justify-between items-start gap-2 mb-1.5">
            <Link to={`/deals/${deal.id}`} className="min-w-0">
              <h4 className="font-semibold text-ink-100 text-sm leading-snug hover:text-brand-400 truncate">{deal.title}</h4>
            </Link>
            <Link to={`/deals/${deal.id}`} className="text-ink-500 hover:text-ink-300 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <MoreHorizontal className="w-4 h-4" />
            </Link>
          </div>

          {contactName && (
            <p className="flex items-center gap-1.5 text-xs text-ink-400 mb-2">
              <User className="w-3 h-3 shrink-0" />{contactName}
            </p>
          )}

          <p className="font-mono text-[17px] font-bold text-ink-100 mb-2">${(Number(deal.amount) || 0).toLocaleString()}</p>

          {interests.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2.5">
              {interests.map(i => (
                <span key={i} className="px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-300 text-[10px] font-semibold">{i}</span>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] border-t border-ink-800 pt-2.5">
            {goingCold ? (
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                <Snowflake className="w-3 h-3" />{daysInStage}d idle — going cold
              </span>
            ) : (
              <span className="text-ink-500">{daysInStage}d in stage</span>
            )}
            {!closed && !followUp ? (
              <span className="flex items-center gap-1 text-red-400 font-semibold">
                <AlertTriangle className="w-3 h-3" />No follow-up
              </span>
            ) : !closed && followUp ? (
              <span className={cn('flex items-center gap-1 font-semibold', followUpState === 'overdue' ? 'text-red-400' : followUpState === 'today' ? 'text-amber-400' : 'text-brand-300')}>
                <CalendarClock className="w-3 h-3" />{formatFollowUpDue(followUp)}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Draggable>
  );
}
