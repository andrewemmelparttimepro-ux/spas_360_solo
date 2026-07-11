import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, MoreHorizontal, Calendar, AlertTriangle, User, Snowflake, Link2, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/ui/Toast';
import { usePipeline, type PipelineDeal } from '@/hooks/usePipeline';
import { useCustomerDrag, type DragCustomer } from '@/contexts/CustomerDragContext';
import SalesBoard from '@/components/SalesBoard';
import NewCustomerWizard from '@/components/NewCustomerWizard';
import QuickDealModal from '@/components/QuickDealModal';
import { Skeleton, StatsSkeleton, BoardSkeleton } from '@/components/ui/Skeleton';

export default function Deals() {
  const { stages, deals, dealsWithTasks, isLoading, getDealsForStage, moveDeal, refresh } = usePipeline();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { dragging, activeTarget, setDropHandler } = useCustomerDrag();
  const [showWizard, setShowWizard] = useState(false);
  // Customer card dropped from the CRM: onto a deal → attach, onto a stage → new deal
  const [attach, setAttach] = useState<{ customer: DragCustomer; dealId: string } | null>(null);
  const [quickDeal, setQuickDeal] = useState<{ contactId: string; stageId?: string } | null>(null);
  // IKEA effect: spotlight the customer card the salesperson just built
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

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

      {/* The live board — realtime scoreboard above the pipeline */}
      <SalesBoard deals={deals} stages={stages} />

      <div className="flex-1 overflow-x-auto pb-4" data-cdrop-scroll>
        <DragDropContext onDragEnd={moveDeal}>
          <div className="flex space-x-4 h-full items-start">
            {stages.map(stage => {
              const stageDeals = getDealsForStage(stage.id);
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
                            hasTask={dealsWithTasks.has(deal.id)}
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

function DealCard({ deal, index, hasTask, closed, highlight }: { deal: PipelineDeal; index: number; hasTask: boolean; closed?: boolean; highlight?: boolean }) {
  const { activeTarget } = useCustomerDrag();
  const daysInStage = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24));
  const goingCold = !closed && daysInStage > 7; // loss framing: idle deals are money walking away
  const contactName = deal.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name}` : null;
  const interests = (deal.product_interest ?? []).slice(0, 3);
  const customerIsOver = activeTarget === `deal:${deal.id}`;

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
            {!hasTask ? (
              <span className="flex items-center gap-1 text-red-400 font-semibold">
                <AlertTriangle className="w-3 h-3" />No follow-up
              </span>
            ) : deal.expected_close_date ? (
              <span className="flex items-center text-ink-500">
                <Calendar className="w-3 h-3 mr-1" />{new Date(deal.expected_close_date).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </Draggable>
  );
}
