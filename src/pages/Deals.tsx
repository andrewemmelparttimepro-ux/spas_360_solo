import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, MoreHorizontal, Calendar, AlertTriangle, User, Snowflake } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { usePipeline, type PipelineDeal } from '@/hooks/usePipeline';
import SalesBoard from '@/components/SalesBoard';
import NewCustomerWizard from '@/components/NewCustomerWizard';

export default function Deals() {
  const { stages, deals, dealsWithTasks, isLoading, getDealsForStage, moveDeal, refresh } = usePipeline();
  const [showWizard, setShowWizard] = useState(false);
  // IKEA effect: spotlight the customer card the salesperson just built
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Created from the dashboard's "+ New" → arrive here with the new card pulsing
  useEffect(() => {
    const hl = (location.state as { highlight?: string } | null)?.highlight;
    if (hl) {
      setHighlightId(hl);
      setTimeout(() => setHighlightId(null), 4000);
      navigate(location.pathname, { replace: true, state: null }); // consume the flag
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-ink-700 border-t-brand-500 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4 shrink-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-ink-100 tracking-tight">Deals</h1>
          <p className="hidden sm:block text-sm text-ink-400 mt-1">Every customer, every stage — live</p>
        </div>
        <button onClick={() => setShowWizard(true)} className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          New Customer
        </button>
      </div>

      {showWizard && (
        <NewCustomerWizard
          onClose={() => setShowWizard(false)}
          onCreated={(dealId) => {
            refresh();
            if (dealId) {
              setHighlightId(dealId);
              setTimeout(() => setHighlightId(null), 4000);
            }
          }}
        />
      )}

      {/* The live board — realtime scoreboard above the pipeline */}
      <SalesBoard deals={deals} stages={stages} />

      <div className="flex-1 overflow-x-auto pb-4">
        <DragDropContext onDragEnd={moveDeal}>
          <div className="flex space-x-4 h-full items-start">
            {stages.map(stage => {
              const stageDeals = getDealsForStage(stage.id);
              return (
                <div key={stage.id} className="w-72 flex-shrink-0 flex flex-col bg-ink-950/60 rounded-xl border border-ink-700 max-h-full">
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
                            closed={stage.name.startsWith('Closed')}
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
  const daysInStage = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24));
  const goingCold = !closed && daysInStage > 7; // loss framing: idle deals are money walking away
  const contactName = deal.contacts ? `${deal.contacts.first_name} ${deal.contacts.last_name}` : null;
  const interests = (deal.product_interest ?? []).slice(0, 3);

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
          className={cn(
            'bg-ink-900 p-3.5 rounded-lg border border-ink-700 border-l-[3px] group hover:border-brand-500/40 transition-all',
            priorityEdge[deal.priority] ?? 'border-l-ink-600',
            snapshot.isDragging ? 'shadow-lg ring-2 ring-brand-500/50' : '',
            highlight && 'ring-2 ring-brand-400 shadow-[0_0_24px_rgba(52,160,255,0.4)] animate-pulse'
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
