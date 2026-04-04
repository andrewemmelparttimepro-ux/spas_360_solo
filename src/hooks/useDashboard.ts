import { statCards, actionItems, revenueData } from '@/data/dashboard';

export function useDashboardStats() {
  // Future: fetch from API, return { stats, isLoading, error }
  return {
    stats: statCards,
    actions: actionItems,
    revenueData,
    isLoading: false,
  };
}
