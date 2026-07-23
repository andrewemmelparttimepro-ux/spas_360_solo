import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, MoreHorizontal, CalendarClock, AlertTriangle, User, Snowflake, Link2, X, Search, UsersRound } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { usePipeline, type PipelineDeal } from '@/hooks/usePipeline';
import { formatFollowUpDue, getFollowUpState, type DealFollowUp, type FollowUpState } from '@/lib/followUp';
import { useCustomerDrag, type DragCustomer } from '@/contexts/CustomerDragContext';
import SalesBoard from '@/components/SalesBoard';
import NewCustomerWizard from '@/components/NewCustomerWizard';
import QuickDealModal from '@/components/QuickDealModal';
import { Skeleton, StatsSkeleton, BoardSkeleton } from '@/components/ui/Skeleton';

export default function Deals() {
  const { stages, deals, salespeople, followUpsByDeal, isLoading, moveDeal, refresh } = usePipeline();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { dragging, activeTarget, setDropHandler } = useCustomerDrag();
  const [showWizard, setShowWizard] = useState(false);
  // Customer card dropped from the CRM: onto a deal → attach, onto a stage → new deal
  const [attach, setAttach] = useState<{ customer: DragCustomer; dealId: string } | null>(null);
  const [quickDeal, setQuickDeal] = useState<{ contactId: string; stageId?: string } | null>(null);
  // IKEA effect: spotlight the customer card the salesperson just built
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [dealSearch, setDealSearch] = useState('');
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
    const oldName = deal.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name}` : 'no one';
    await supabase.from('notes').insert({
      deal_id: deal.id,
      contact_id: customer.id,
      body: `🔗 ${profile.first_name} ${profile.last_name} attached ${customer.first_name} ${customer.last_name} to this deal (was ${oldName}).`,
      created_by: profile.id,
    });
    toast(`${customer.first_name} attached to “${deal.title}”`, 'success');
    setAttach(null);
    spotlight(deal.id);
    refresh();
  }, [attach, deals, profile, toast, refresh, spotlight]);

  if (isLoading) {
    return (
      <div className="h-full max-w-[1600px] mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <StatsSkeleton />
        <BoardSkeleton />
      </div>
    );
  }

  const attachDeal = attach ? deals.find(d => d.id === attach.dealId) : null;
  const searchNeedle = dealSearch.trim().toLowerCase();
  const matchesOwnerAndSearch = (deal: PipelineDeal) => {
    if (ownerFilter !== 'all' && deal.assigned_to !== ownerFilter) return false;
    if (!searchNeedle) return true;
    const contactName = deal.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name}` : '';
    const ownerName = deal.assigned ? `${deal.assigned.first_name} ${deal.assigned.last_name}` : '';
    return `${deal.title} ${contactName} ${ownerName}`.toLowerCase().includes(searchNeedle);
  };
  const visibleDeals = deals.filter(matchesOwnerAndSearch);
  const closedStageIds = new Set(stages.filter(stage => stage.name.startsWith('Closed')).map(stage => stage.id));
  const activeDeals = visibleDeals
    .filter(deal => !closedStageIds.has(deal.stage_id))
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
  const missingFollowUps = activeDeals.filter(deal => !followUpsByDeal.has(deal.id)).length;
  const overdueFollowUps = activeDeals.filter(deal => getFollowUpState(followUpsByDeal.get(deal.id)) === 'overdue').length;
  const dueToday = activeDeals.filter(deal => getFollowUpState(followUpsByDeal.get(deal.id)) === 'today').length;

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink-100 tracking-tight">Deals</h1>
          <p className="hidden sm:block text-sm text-ink-400 mt-1">Every customer, every stage — live</p>
        </div>
        {/* Violet = customer action, everywhere it appears (page color system) */}
        <button onClick={() => setShowWizard(true)} className="bg-violet-500 hover:bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </button>
      </div>

      {showWizard && (
        <NewCustomerWizard
          onClose={() => setShowWizard(false)}
          onCreated={(dealId) => {
            refresh();
            if (dealId) spotlight(dealId);
          }}
        />
      )}

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
          <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl w-full max-w-md">
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

      <div className="mb-5 overflow-hidden rounded-2xl border border-ink-700 bg-ink-900/90 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-ink-700 bg-ink-950/80 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-300">Sales follow-up control</p>
            <h2 className="mt-1 text-lg font-semibold text-ink-100">Active leads and their next activity</h2>
            <p className="mt-1 text-sm text-ink-400">Every open lead needs a dated next step. Missing and overdue follow-ups rise to the top automatically.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[220px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
              <input
                value={dealSearch}
                onChange={(event) => setDealSearch(event.target.value)}
                placeholder="Search active deals"
                aria-label="Search active deals"
                className="w-full rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-3 text-sm text-ink-100 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
            </label>
            {isManager ? (
              <label className="relative">
                <UsersRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500" />
                <select
                  value={ownerFilter}
                  onChange={(event) => setOwnerFilter(event.target.value)}
                  aria-label="Filter by salesperson"
                  className="appearance-none rounded-lg border border-ink-700 bg-ink-900 py-2 pl-9 pr-8 text-sm text-ink-100 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                >
                  <option value="all">All salespeople</option>
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
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-ink-800 border-b border-ink-800 bg-ink-950/40 sm:grid-cols-4">
          <FollowUpStat label="Active leads" value={activeDeals.length} tone="neutral" />
          <FollowUpStat label="No next activity" value={missingFollowUps} tone={missingFollowUps ? 'danger' : 'good'} />
          <FollowUpStat label="Overdue" value={overdueFollowUps} tone={overdueFollowUps ? 'danger' : 'good'} />
          <FollowUpStat label="Due today" value={dueToday} tone={dueToday ? 'warning' : 'neutral'} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-ink-800 text-sm">
            <thead className="bg-ink-950/70 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-500">
              <tr>
                <th className="px-5 py-3">Deal</th>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Stage</th>
                <th className="px-5 py-3">Deal owner</th>
                <th className="px-5 py-3">Next activity</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Priority</th>
                <th className="px-5 py-3">Expected close</th>
                <th className="px-5 py-3">Open tasks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-800/80">
              {activeDeals.map((deal) => {
                const stage = stages.find((entry) => entry.id === deal.stage_id);
                const contactName = deal.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name}` : 'Unassigned';
                const ownerName = deal.assigned ? `${deal.assigned.first_name} ${deal.assigned.last_name}` : 'Unassigned';
                const followUp = followUpsByDeal.get(deal.id);
                const followUpState = getFollowUpState(followUp);
                return (
                  <tr key={deal.id} className="bg-ink-900/70 hover:bg-brand-500/5">
                    <td className="px-5 py-3">
                      <Link to={`/deals/${deal.id}`} className="font-medium text-ink-100 hover:text-brand-400">{deal.title}</Link>
                    </td>
                    <td className="px-5 py-3 text-ink-300">{contactName}</td>
                    <td className="px-5 py-3 text-ink-400">{stage?.name ?? 'Unknown stage'}</td>
                    <td className="px-5 py-3 text-ink-300">{ownerName}</td>
                    <td className="min-w-[210px] px-5 py-3">
                      {followUp ? (
                        <Link to={`/deals/${deal.id}`} className={cn('block rounded-lg border px-3 py-2 transition hover:brightness-110', followUpTone[followUpState])}>
                          <span className="block text-xs font-semibold">{formatFollowUpDue(followUp)}</span>
                          <span className="mt-0.5 block max-w-[220px] truncate text-[11px] opacity-80">{followUp.title}</span>
                        </Link>
                      ) : (
                        <Link to={`/deals/${deal.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition hover:bg-red-500/15">
                          <AlertTriangle className="h-3.5 w-3.5" /> Set next task
                        </Link>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-ink-100">${(Number(deal.amount) || 0).toLocaleString()}</td>
                    <td className="px-5 py-3"><span className="rounded-full border border-ink-700 bg-ink-950 px-2.5 py-1 text-xs font-medium text-ink-300">{deal.priority}</span></td>
                    <td className="px-5 py-3 text-ink-400">{deal.expected_close_date ? new Date(deal.expected_close_date).toLocaleDateString() : 'Open-ended'}</td>
                    <td className="px-5 py-3 text-center font-mono text-ink-300">{followUp?.openTaskCount ?? 0}</td>
                  </tr>
                );
              })}
              {activeDeals.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-5 py-10 text-center text-sm text-ink-500">
                    No active deals match this salesperson and search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* The live board, realtime scoreboard above the pipeline */}
      <SalesBoard deals={visibleDeals} stages={stages} followUpsByDeal={followUpsByDeal} />

      <div className="flex-1 overflow-x-auto pb-4" data-cdrop-scroll>
        <DragDropContext onDragEnd={moveDeal}>
          <div className="flex space-x-4 h-full items-start">
            {stages.map(stage => {
              const stageDeals = visibleDeals.filter(deal => deal.stage_id === stage.id);
              const closed = stage.name.startsWith('Closed');
              // Closed stages don't take customer drops — new deals start live
              const stageDropProps = !closed ? { 'data-cdrop': 'stage', 'data-cdrop-stage': stage.id } : {};
              const stageIsOver = activeTarget === `stage:${stage.id}`;
              return (
                <div
                  key={stage.id}
                  {...stageDropProps}
                  className={cn(
                    'w-72 flex-shrink-0 flex flex-col bg-ink-950/60 rounded-xl border border-ink-700 max-h-full transition-all',
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

function FollowUpStat({ label, value, tone }: { label: string; value: number; tone: 'neutral' | 'danger' | 'warning' | 'good' }) {
  const tones = {
    neutral: 'text-ink-100',
    danger: 'text-red-300',
    warning: 'text-amber-300',
    good: 'text-emerald-300',
  };

  return (
    <div className="px-4 py-3">
      <p className={cn('font-mono text-xl font-bold', tones[tone])}>{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-500">{label}</p>
    </div>
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
