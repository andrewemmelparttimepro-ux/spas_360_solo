import type { PipelineData } from '@/types';

export const initialPipelineData: PipelineData = {
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
