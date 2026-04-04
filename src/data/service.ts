import type { UnscheduledJob, ScheduledJob, JobStatus } from '@/types';

export const unscheduledJobs: UnscheduledJob[] = [
  { id: 'j1', title: 'Wyant – Sundance Hot Tub – Delivery', status: 'Delivery', location: 'Minot', priority: 'High' },
  { id: 'j2', title: 'Johnson – Caldera Repair – Parts on Order', status: 'Parts on Order', location: 'Bismarck', priority: 'Medium' },
  { id: 'j3', title: 'Smith – Jacuzzi Installation – Warranty', status: 'Warranty', location: 'Minot', priority: 'Low' },
  { id: 'j4', title: 'Davis – Swim Spa – Ready for Pickup', status: 'Ready for Pickup', location: 'Bismarck', priority: 'Medium' },
];

export const scheduledJobs: ScheduledJob[] = [
  { id: 's1', title: 'Miller – Maintenance – In Progress', status: 'In Progress', time: '09:00 AM - 11:00 AM', tech: 'Bryson', location: 'Minot' },
  { id: 's2', title: 'Wilson – Repair – Completed', status: 'Completed', time: '11:30 AM - 01:00 PM', tech: 'Bryson', location: 'Minot' },
  { id: 's3', title: 'Taylor – Delivery – Delivery', status: 'Delivery', time: '02:00 PM - 04:00 PM', tech: 'Ben', location: 'Bismarck' },
];

export const statusColors: Record<JobStatus, string> = {
  'Delivery': 'border-l-red-500 bg-red-50 text-red-900',
  'Parts on Order': 'border-l-slate-800 bg-slate-100 text-slate-900',
  'Warranty': 'border-l-purple-500 bg-purple-50 text-purple-900',
  'Ready for Pickup': 'border-l-emerald-500 bg-emerald-50 text-emerald-900',
  'In Progress': 'border-l-blue-500 bg-blue-50 text-blue-900',
  'Completed': 'border-l-slate-400 bg-slate-50 text-slate-600',
  'Cancelled': 'border-l-slate-300 bg-slate-50 text-slate-400 opacity-60',
};
