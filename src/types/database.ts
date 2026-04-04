// Database types for Supabase — keep in sync with schema.sql
// In production, use: npx supabase gen types typescript

export type UserRole = 'owner_manager' | 'service_manager' | 'salesperson' | 'technician';
export type DealPriority = 'High' | 'Medium' | 'Low';
export type ContactType = 'Lead' | 'Prospect' | 'Customer' | 'Past Customer';
export type LeadSource = 'Walk-in' | 'Website' | 'Referral' | 'Ad' | 'Phone' | 'Event' | 'Other';
export type JobType = 'Delivery' | 'Repair' | 'Installation' | 'Warranty' | 'Maintenance' | 'Pickup';
export type JobStatus = 'Delivery' | 'Parts on Order' | 'Warranty' | 'Ready for Pickup' | 'In Progress' | 'Completed' | 'Cancelled';
export type PartStatus = 'Not Ordered' | 'Ordered' | 'Shipped' | 'Backordered' | 'Received';
export type InventoryStatus = 'On Order' | 'In Stock' | 'Sold' | 'In Transit' | 'Delivered' | 'Returned';
export type TaskStatus = 'Pending' | 'In Progress' | 'Completed' | 'Overdue';
export type MessageSender = 'system' | 'customer' | 'agent';

// Row types (what you get back from queries)
export interface Organization { id: string; name: string; created_at: string; }
export interface Location { id: string; org_id: string; name: string; address: string | null; phone: string | null; created_at: string; }

export interface Profile {
  id: string; org_id: string; location_id: string | null; role: UserRole;
  first_name: string; last_name: string; email: string; phone: string | null;
  avatar_url: string | null; created_at: string;
}

export interface Contact {
  id: string; org_id: string; location_id: string | null;
  first_name: string; last_name: string; email: string | null;
  phone: string; phone_secondary: string | null;
  mailing_address: string | null; lead_source: LeadSource;
  customer_type: ContactType; assigned_to: string | null;
  tags: string[] | null; qb_customer_id: string | null;
  last_activity_at: string | null; created_at: string; updated_at: string;
}

export interface Property {
  id: string; contact_id: string; address: string; property_type: string;
  notes: string | null; lat: number | null; lng: number | null; created_at: string;
}

export interface PipelineStage {
  id: string; org_id: string; name: string; position: number;
  probability: number; created_at: string;
}

export interface Deal {
  id: string; org_id: string; contact_id: string; stage_id: string;
  title: string; amount: number | null; priority: DealPriority;
  expected_close_date: string | null; assigned_to: string;
  product_interest: string[] | null; lead_source: LeadSource;
  lost_reason: string | null; location_id: string | null;
  position: number; created_at: string; updated_at: string;
}

export interface Job {
  id: string; org_id: string; contact_id: string; property_id: string | null;
  location_id: string; title: string; job_type: JobType; status: JobStatus;
  description: string | null; scheduled_at: string | null;
  estimated_duration: number | null; priority: DealPriority | null;
  amount_to_collect: number | null; created_by: string;
  created_at: string; updated_at: string;
}

export interface Part {
  id: string; job_id: string; part_number: string; description: string;
  manufacturer: string | null; status: PartStatus;
  order_date: string | null; expected_arrival: string | null;
  tracking_number: string | null; supplier: string | null;
  cost: number | null; received_date: string | null;
  notes: string | null; created_at: string; updated_at: string;
}

export interface InventoryItem {
  id: string; org_id: string; location_id: string; sku: string;
  product: string; brand: string | null; category: string;
  model: string | null; color_finish: string | null;
  status: InventoryStatus; cost: number | null; msrp: number | null;
  sale_price: number | null; customer_id: string | null;
  deal_id: string | null; job_id: string | null;
  date_received: string | null; date_sold: string | null;
  date_delivered: string | null; warranty_info: string | null;
  notes: string | null; created_at: string; updated_at: string;
}

export interface CommunicationThread {
  id: string; org_id: string; contact_id: string;
  thread_type: 'sms' | 'email'; last_message_at: string | null;
  created_at: string;
}

export interface Message {
  id: string; thread_id: string; sender_type: MessageSender;
  sender_id: string | null; body: string; created_at: string;
}

export interface Task {
  id: string; org_id: string; assigned_to: string;
  deal_id: string | null; contact_id: string | null; job_id: string | null;
  title: string; description: string | null; due_at: string;
  priority: DealPriority; status: TaskStatus;
  task_type: string | null; created_by: string;
  created_at: string; updated_at: string;
}

export interface Note {
  id: string; contact_id: string | null; deal_id: string | null;
  job_id: string | null; body: string; created_by: string;
  created_at: string;
}

export interface TimeEntry {
  id: string; job_id: string; user_id: string;
  started_at: string; ended_at: string | null;
  break_minutes: number | null; notes: string | null;
  created_at: string;
}

export interface Notification {
  id: string; user_id: string; type: string; title: string;
  body: string | null; read: boolean; link: string | null;
  created_at: string;
}

// Simplified Database type for Supabase client generic
// Using Record<string, unknown> for Insert/Update to avoid circular ref issues
// The actual type safety comes from our Row interfaces above
export interface Database {
  public: {
    Tables: {
      [K in 'organizations' | 'locations' | 'profiles' | 'contacts' | 'properties' |
       'pipeline_stages' | 'deals' | 'jobs' | 'job_assignments' | 'parts' |
       'inventory_items' | 'communication_threads' | 'messages' | 'tasks' |
       'notes' | 'time_entries' | 'notifications' | 'audit_log']: {
        Row: Record<string, unknown>;
        Insert: Record<string, unknown>;
        Update: Record<string, unknown>;
      };
    };
    Functions: Record<string, unknown>;
  };
}
