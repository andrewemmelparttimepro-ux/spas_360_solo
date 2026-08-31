import type { Profile } from '@/types/database';
import { isActiveDeal } from './dealStage.ts';
import { THRAWN_PROFILE_ID } from './upcomingTasks.ts';

export const ALL_DEAL_OWNERS = 'all' as const;
export const UNASSIGNED_DEAL_OWNER = 'unassigned' as const;

export type DealOwnerFilter = typeof ALL_DEAL_OWNERS | typeof UNASSIGNED_DEAL_OWNER | string;
export type DealOwnerOption = Pick<Profile, 'id' | 'first_name' | 'last_name' | 'role'>;

type DealOwnerAssignment = {
  assigned_to: string | null;
  stage_id: string;
};

type StageFlags = {
  id: string;
  is_won: boolean;
  is_lost: boolean;
};

export function filterDealOwnerOptions(owners: DealOwnerOption[]): DealOwnerOption[] {
  return owners.filter(owner => owner.id !== THRAWN_PROFILE_ID);
}

export function matchesDealOwnerFilter(
  deal: DealOwnerAssignment,
  stages: StageFlags[],
  ownerFilter: DealOwnerFilter,
): boolean {
  if (ownerFilter === ALL_DEAL_OWNERS) return true;
  if (ownerFilter === UNASSIGNED_DEAL_OWNER) {
    return deal.assigned_to === null && isActiveDeal(deal, stages);
  }
  return deal.assigned_to === ownerFilter;
}
