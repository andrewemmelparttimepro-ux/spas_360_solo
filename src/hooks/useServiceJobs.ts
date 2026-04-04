import { unscheduledJobs, scheduledJobs, statusColors } from '@/data/service';

export function useServiceJobs() {
  // Future: fetch from API, support filtering by location/status/tech
  return {
    unscheduledJobs,
    scheduledJobs,
    statusColors,
    isLoading: false,
  };
}
