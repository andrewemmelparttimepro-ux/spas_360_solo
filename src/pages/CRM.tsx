import { useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Plus, MoreHorizontal, Calendar, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

// Mock Data
const initialData = {
  stages: {
    'stage-1': { id: 'stage-1', title: 'Showroom Visit Scheduled', dealIds: ['deal-1'] },
    'stage-2': { id: 'stage-2', title: 'Showroom Visit Complete', dealIds: ['deal-2', 'deal-3'] },
    'stage-3': { id: 'stage-3', title: 'Estimate Sent', dealIds: ['deal-4'] },
    'stage-4': { id: 'stage-4', title: 'In Discussion', dealIds: [] },
    'stage-5': { id: 'stage-5', title: 'Verbal Commitment', dealIds: ['deal-5'] },
  },
  deals: {
    'deal-1': { id: 'deal-1', title: 'Smith - Jacuzzi J-300', amount: 9500, priority: 'Medium', days: 2, nextTask: 'Tomorrow' },
    'deal-2': { id: 'deal-2', title: 'Wyant - Sundance Optima', amount: 14200, priority: 'High', days: 1, nextTask: 'Overdue' },
    'deal-3': { id: 'deal-3', title: 'Johnson - Caldera Utopia', amount: 16000, priority: 'Low', days: 5, nextTask: 'Next Week' },
    'deal-4': { id: 'deal-4', title: 'Davis - Swim Spa', amount: 28000, priority: 'High', days: 3, nextTask: 'Today' },
    'deal-5': { id: 'deal-5', title: 'Miller - Sauna', amount: 6500, priority: 'Medium', days: 10, nextTask: 'Tomorrow' },
  },
  stageOrder: ['stage-1', 'stage-2', 'stage-3', 'stage-4', 'stage-5'],
};

export default function CRM() {
  const [data, setData] = useState(initialData);

  const onDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const startStage = data.stages[source.droppableId as keyof typeof data.stages];
    const finishStage = data.stages[destination.droppableId as keyof typeof data.stages];

    if (startStage === finishStage) {
      const newDealIds = Array.from(startStage.dealIds);
      newDealIds.splice(source.index, 1);
      newDealIds.splice(destination.index, 0, draggableId);

      const newStage = { ...startStage, dealIds: newDealIds };
      setData({ ...data, stages: { ...data.stages, [newStage.id]: newStage } });
      return;
    }

    // Moving from one stage to another
    const startDealIds = Array.from(startStage.dealIds);
    startDealIds.splice(source.index, 1);
    const newStart = { ...startStage, dealIds: startDealIds };

    const finishDealIds = Array.from(finishStage.dealIds);
    finishDealIds.splice(destination.index, 0, draggableId);
    const newFinish = { ...finishStage, dealIds: finishDealIds };

    setData({
      ...data,
      stages: {
        ...data.stages,
        [newStart.id]: newStart,
        [newFinish.id]: newFinish,
      },
    });
  };

  return (
    <div className="h-full flex flex-col max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between mb-6 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Sales Pipeline</h1>
          <p className="text-sm text-slate-500 mt-1">Manage deals and follow-ups</p>
        </div>
        <button className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center shadow-sm">
          <Plus className="w-4 h-4 mr-2" />
          New Deal
        </button>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex space-x-4 h-full items-start">
            {data.stageOrder.map((stageId) => {
              const stage = data.stages[stageId as keyof typeof data.stages];
              const deals = stage.dealIds.map((dealId) => data.deals[dealId as keyof typeof data.deals]);

              return (
                <div key={stage.id} className="w-80 flex-shrink-0 flex flex-col bg-slate-100/50 rounded-xl border border-slate-200 max-h-full">
                  <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-slate-100 rounded-t-xl">
                    <h3 className="font-semibold text-slate-700 text-sm">{stage.title}</h3>
                    <span className="bg-slate-200 text-slate-600 text-xs font-medium px-2 py-1 rounded-full">
                      {deals.length}
                    </span>
                  </div>

                  <Droppable droppableId={stage.id}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={cn(
                          "flex-1 p-3 overflow-y-auto min-h-[150px] space-y-3 transition-colors",
                          snapshot.isDraggingOver ? "bg-slate-200/50" : ""
                        )}
                      >
                        {deals.map((deal, index) => (
                          // @ts-ignore
                          <Draggable key={deal.id} draggableId={deal.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                className={cn(
                                  "bg-white p-4 rounded-lg shadow-sm border border-slate-200 group hover:border-cyan-300 transition-all",
                                  snapshot.isDragging ? "shadow-lg ring-2 ring-cyan-500 ring-opacity-50" : ""
                                )}
                              >
                                <div className="flex justify-between items-start mb-2">
                                  <Badge priority={deal.priority} />
                                  <button className="text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <MoreHorizontal className="w-4 h-4" />
                                  </button>
                                </div>
                                <h4 className="font-medium text-slate-900 text-sm mb-1">{deal.title}</h4>
                                <p className="text-lg font-bold text-slate-700 mb-3">${deal.amount.toLocaleString()}</p>
                                
                                <div className="flex items-center justify-between text-xs border-t border-slate-100 pt-3">
                                  <div className="text-slate-500">
                                    {deal.days} days in stage
                                  </div>
                                  <div className={cn(
                                    "flex items-center font-medium",
                                    deal.nextTask === 'Overdue' ? 'text-red-600' : 
                                    deal.nextTask === 'Today' ? 'text-amber-600' : 'text-slate-500'
                                  )}>
                                    {deal.nextTask === 'Overdue' ? (
                                      <AlertCircle className="w-3 h-3 mr-1" />
                                    ) : (
                                      <Calendar className="w-3 h-3 mr-1" />
                                    )}
                                    {deal.nextTask}
                                  </div>
                                </div>
                              </div>
                            )}
                          </Draggable>
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

function Badge({ priority }: { priority: string }) {
  const colors = {
    High: 'bg-red-100 text-red-700 border-red-200',
    Medium: 'bg-amber-100 text-amber-700 border-amber-200',
    Low: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  
  return (
    <span className={cn("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border", colors[priority as keyof typeof colors])}>
      {priority}
    </span>
  );
}
