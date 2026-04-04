import type { RevenueDataPoint, ActionItem, StatCard } from '@/types';
import { DollarSign, Users, Wrench, AlertCircle } from 'lucide-react';

export const revenueData: RevenueDataPoint[] = [
  { name: 'Mon', revenue: 4000 },
  { name: 'Tue', revenue: 3000 },
  { name: 'Wed', revenue: 2000 },
  { name: 'Thu', revenue: 2780 },
  { name: 'Fri', revenue: 1890 },
  { name: 'Sat', revenue: 2390 },
  { name: 'Sun', revenue: 3490 },
];

export const statCards: StatCard[] = [
  { title: 'Total Revenue', value: '$45,231', trend: '+12.5%', isPositive: true, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  { title: 'Active Deals', value: '24', trend: '+4', isPositive: true, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100' },
  { title: 'Unscheduled Jobs', value: '12', trend: '-2', isPositive: true, icon: Wrench, color: 'text-amber-600', bg: 'bg-amber-100' },
  { title: 'Parts Overdue', value: '3', trend: '+1', isPositive: false, icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-100' },
];

export const actionItems: ActionItem[] = [
  { id: 'a1', title: 'Follow up with Wyant', desc: 'Sundance Optima 880 quote', time: 'Overdue by 2h', type: 'task' },
  { id: 'a2', title: 'Part Arrival: Heater Assembly', desc: 'For Johnson Repair Job', time: 'Just now', type: 'part' },
  { id: 'a3', title: 'Invoice Paid: Smith', desc: 'Ready for warranty registration', time: '2 hrs ago', type: 'invoice' },
  { id: 'a4', title: 'New Web Lead', desc: 'Interested in Swim Spas', time: '4 hrs ago', type: 'lead' },
];
