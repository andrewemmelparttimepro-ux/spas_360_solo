// Shared types used across the application
import type { LucideIcon } from 'lucide-react';

// ─── Contact / Customer ───────────────────────────────────────────
export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone: string;
  location: 'Minot' | 'Bismarck';
}

// ─── Dashboard ────────────────────────────────────────────────────
export interface StatCard {
  title: string;
  value: string;
  trend: string;
  isPositive: boolean;
  icon: LucideIcon;
  color: string;
  bg: string;
}

export type ActionType = 'task' | 'part' | 'invoice' | 'lead';

export interface ActionItem {
  id: string;
  title: string;
  desc: string;
  time: string;
  type: ActionType;
}

export interface RevenueDataPoint {
  name: string;
  revenue: number;
}

// ─── CRM / Pipeline ──────────────────────────────────────────────
export interface Deal {
  id: string;
  title: string;
  amount: number;
  priority: 'High' | 'Medium' | 'Low';
  days: number;
  nextTask: string;
}

export interface Stage {
  id: string;
  title: string;
  dealIds: string[];
}

export interface PipelineData {
  stages: Record<string, Stage>;
  deals: Record<string, Deal>;
  stageOrder: string[];
}

// ─── Service & Jobs ───────────────────────────────────────────────
export type JobStatus =
  | 'Delivery'
  | 'Parts on Order'
  | 'Warranty'
  | 'Ready for Pickup'
  | 'In Progress'
  | 'Completed'
  | 'Cancelled';

export interface UnscheduledJob {
  id: string;
  title: string;
  status: JobStatus;
  location: string;
  priority: 'High' | 'Medium' | 'Low';
}

export interface ScheduledJob {
  id: string;
  title: string;
  status: JobStatus;
  time: string;
  tech: string;
  location: string;
}

// ─── Inventory ────────────────────────────────────────────────────
export type InventoryStatus = 'In Stock' | 'Sold (Awaiting Delivery)' | 'On Order' | 'In Transit';

export interface InventoryItem {
  id: string;
  sku: string;
  product: string;
  category: string;
  status: InventoryStatus;
  location: string;
  price: number;
}

// ─── Communication ────────────────────────────────────────────────
export interface Conversation {
  id: string;
  name: string;
  lastMessage: string;
  time: string;
  unread: number;
  type: 'sms' | 'email';
}

export type MessageSender = 'system' | 'customer' | 'agent';

export interface Message {
  id: string;
  sender: MessageSender;
  text: string;
  time: string;
}
