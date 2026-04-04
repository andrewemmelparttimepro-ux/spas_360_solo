import { useState, useCallback } from 'react';
import type { DropResult } from '@hello-pangea/dnd';
import type { PipelineData, Deal } from '@/types';
import { initialPipelineData } from '@/data/crm';

export function usePipeline() {
  const [data, setData] = useState<PipelineData>(initialPipelineData);

  const moveDeal = useCallback((result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const startStage = data.stages[source.droppableId];
    const finishStage = data.stages[destination.droppableId];

    if (!startStage || !finishStage) return;

    if (startStage === finishStage) {
      const newDealIds = Array.from(startStage.dealIds);
      newDealIds.splice(source.index, 1);
      newDealIds.splice(destination.index, 0, draggableId);

      const newStage = { ...startStage, dealIds: newDealIds };
      setData(prev => ({ ...prev, stages: { ...prev.stages, [newStage.id]: newStage } }));
      return;
    }

    const startDealIds = Array.from(startStage.dealIds);
    startDealIds.splice(source.index, 1);
    const newStart = { ...startStage, dealIds: startDealIds };

    const finishDealIds = Array.from(finishStage.dealIds);
    finishDealIds.splice(destination.index, 0, draggableId);
    const newFinish = { ...finishStage, dealIds: finishDealIds };

    setData(prev => ({
      ...prev,
      stages: {
        ...prev.stages,
        [newStart.id]: newStart,
        [newFinish.id]: newFinish,
      },
    }));
  }, [data.stages]);

  const getDealsForStage = useCallback((stageId: string): Deal[] => {
    const stage = data.stages[stageId];
    if (!stage) return [];
    return stage.dealIds
      .map(id => data.deals[id])
      .filter((d): d is Deal => d !== undefined);
  }, [data]);

  return {
    data,
    moveDeal,
    getDealsForStage,
    isLoading: false,
  };
}
