import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Plus, MoreHorizontal, Calendar, AlertCircle, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { usePipeline } from '@/hooks/usePipeline';
import { useContacts } from '@/hooks/useContacts';
import { useAuth } from '@/contexts/AuthContext';
import type { Deal } from '@/types/database';

export default function CRM() {
  const { stages, isLoading, getDealsForStage, moveDeal, createDeal } = usePipeline();
  const { contacts } = useContacts();
  const { locations } = useAuth();
  const [showCreate, setShowCreate] = useState(false);
  const [newDeal, setNewDeal] = useState({
    title: '', contact_id: '', stage_id: '', amount: '',
    priority: 'Medium' as 'High' | 'Medium' | 'Low',
    lead_source: 'Walk-in' as const,
    expected_close_date: '', location_id: '',
    product_interest: [] as string[],
  });

  const handleCreate = async () => {
    const stageId = newDeal.stage_id || (stages[0]?.id ?? '');
    await createDeal({
      title: newDeal.title,
      contact_id: newDeal.contact_id,
      stage_id: stageId,
      amount: newDeal.amount ? parseFloat(newDeal.amount) : null,
      priority: newDeal.priority,
      lead_source: newDeal.lead_source,
      expected_close_date: newDeal.expected_close_date || null,
      location_id: newDeal.location_id || null,
      product_interest: newDeal.product_interest.length > 0 ? newDeal.product_interest : null,
      position: 0,
    });
    setShowCreate(false);
    setNewDeal({ title: '', contact_id: '', stage_id: '', amount: '', priority: 'Medium', lead_source: 'Walk-in', expected_close_date: '', location_id: '', product_interest: [] });
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-full"><div className="w-8 h-8 border-4 border-slate-200 border-t-sky-400 rounded-full animate-spin" /></div>;
  }

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales Pipeline</h1>
          <p className="text-sm text-slate-500 mt-1">Manage deals and follow-ups</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="bg-sky-500 hover:bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          New Deal
        </button>
      </div>

      {/* Create Deal Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 m-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900">New Deal</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Deal Title *" value={newDeal.title} onChange={e => setNewDeal({...newDeal, title: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
              <select value={newDeal.contact_id} onChange={e => setNewDeal({...newDeal, contact_id: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                <option value="">Select Contact *</option>
                {contacts.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input placeholder="Amount ($)" type="number" value={newDeal.amount} onChange={e => setNewDeal({...newDeal, amount: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" />
                <select value={newDeal.priority} onChange={e => setNewDeal({...newDeal, priority: e.target.value as 'High' | 'Medium' | 'Low'})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="High">High Priority</option>
                  <option value="Medium">Medium Priority</option>
                  <option value="Low">Low Priority</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={newDeal.stage_id} onChange={e => setNewDeal({...newDeal, stage_id: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="">Pipeline Stage</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <select value={newDeal.lead_source} onChange={e => setNewDeal({...newDeal, lead_source: e.target.value as 'Walk-in'})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option>Walk-in</option><option>Website</option><option>Referral</option><option>Ad</option><option>Phone</option><option>Event</option><option>Other</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={newDeal.expected_close_date} onChange={e => setNewDeal({...newDeal, expected_close_date: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400" placeholder="Expected Close" />
                <select value={newDeal.location_id} onChange={e => setNewDeal({...newDeal, location_id: e.target.value})} className="px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:border-sky-400">
                  <option value="">Location</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancel</button>
              <button onClick={handleCreate} disabled={!newDeal.title || !newDeal.contact_id} className="px-4 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded-lg font-medium disabled:opacity-50">Create Deal</button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-x-auto pb-4">
        <DragDropContext onDragEnd={moveDeal}>
          <div className="flex space-x-4 h-full items-start">
            {stages.map(stage => {
              const deals = getDealsForStage(stage.id);
              return (
                <div key={stage.id} className="w-72 flex-shrink-0 flex flex-col bg-slate-100/50 rounded-xl border border-slate-200 max-h-full">
                  <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-100 rounded-t-xl">
                    <h3 className="font-semibold text-slate-700 text-xs uppercase tracking-wider">{stage.name}</h3>
                    <span className="bg-slate-200 text-slate-600 text-xs font-medium px-2 py-0.5 rounded-full">{deals.length}</span>
                  </div>
                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn("flex-1 p-3 overflow-y-auto min-h-[100px] space-y-3 transition-colors", snapshot.isDraggingOver ? "bg-slate-200/50" : "")}
                      >
                        {deals.map((deal, index) => <DealCard key={deal.id} deal={deal} index={index} />)}
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

function DealCard({ deal, index }: { deal: Deal; index: number }) {
  const daysInStage = Math.floor((Date.now() - new Date(deal.updated_at).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <Draggable draggableId={deal.id} index={index}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
          className={cn("bg-white p-4 rounded-lg shadow-sm border border-slate-200 group hover:border-sky-300 transition-all", snapshot.isDragging ? "shadow-lg ring-2 ring-sky-400 ring-opacity-50" : "")}>
          <div className="flex justify-between items-start mb-2">
            <Badge priority={deal.priority} />
            <Link to={`/crm/${deal.id}`} className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
              <MoreHorizontal className="w-4 h-4" />
            </Link>
          </div>
          <Link to={`/crm/${deal.id}`}>
            <h4 className="font-medium text-slate-900 text-sm mb-1 hover:text-sky-600">{deal.title}</h4>
          </Link>
          <p className="text-lg font-bold text-slate-700 mb-3">${(deal.amount ?? 0).toLocaleString()}</p>
          <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3">
            <div className="text-slate-500">{daysInStage}d in stage</div>
            {deal.expected_close_date && (
              <div className="flex items-center text-slate-500">
                <Calendar className="w-3 h-3 mr-1" />{new Date(deal.expected_close_date).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}

const badgeColors: Record<string, string> = {
  High: 'bg-red-100 text-red-700 border-red-200',
  Medium: 'bg-amber-100 text-amber-700 border-amber-200',
  Low: 'bg-blue-100 text-blue-700 border-blue-200',
};

function Badge({ priority }: { priority: string }) {
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border", badgeColors[priority] ?? 'bg-slate-100')}>
      {priority}
    </span>
  );
}
