import type { Deal, PipelineStage } from '@/types/database';

type StageFlags = Pick<PipelineStage, 'id' | 'is_won' | 'is_lost'>;
type DealStage = Pick<Deal, 'stage_id'>;

export function isClosedStage(stage: StageFlags): boolean {
  return stage.is_won || stage.is_lost;
}

export function activePipelineStages<T extends StageFlags>(stages: T[]): T[] {
  return stages.filter(stage => !isClosedStage(stage));
}

export function outcomeStage<T extends StageFlags>(stages: T[], outcome: 'won' | 'lost'): T | undefined {
  return stages.find(stage => outcome === 'won' ? stage.is_won : stage.is_lost);
}

export function isActiveDeal(deal: DealStage, stages: StageFlags[]): boolean {
  const stage = stages.find(entry => entry.id === deal.stage_id);
  return !stage || !isClosedStage(stage);
}
