export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_config: {
        Row: {
          enabled: boolean
          model: string | null
          org_id: string
          provider: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          model?: string | null
          org_id: string
          provider?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          model?: string | null
          org_id?: string
          provider?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_config_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_deliverables: {
        Row: {
          artifact_format: string | null
          content: string
          content_format: string
          created_at: string
          customer_id: string | null
          deal_id: string | null
          delivery_channels: Json
          file_name: string | null
          file_size_bytes: number | null
          id: string
          kind: string
          mime_type: string | null
          missing_fields: Json
          org_id: string
          requested_by: string | null
          source_snapshot: Json
          status: string
          storage_bucket: string | null
          storage_path: string | null
          thread_id: string | null
          title: string
          updated_at: string
          version: number
        }
        Insert: {
          artifact_format?: string | null
          content: string
          content_format?: string
          created_at?: string
          customer_id?: string | null
          deal_id?: string | null
          delivery_channels?: Json
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          missing_fields?: Json
          org_id: string
          requested_by?: string | null
          source_snapshot?: Json
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          thread_id?: string | null
          title: string
          updated_at?: string
          version?: number
        }
        Update: {
          artifact_format?: string | null
          content?: string
          content_format?: string
          created_at?: string
          customer_id?: string | null
          deal_id?: string | null
          delivery_channels?: Json
          file_name?: string | null
          file_size_bytes?: number | null
          id?: string
          kind?: string
          mime_type?: string | null
          missing_fields?: Json
          org_id?: string
          requested_by?: string | null
          source_snapshot?: Json
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          thread_id?: string | null
          title?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_deliverables_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_deliverables_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_deliverables_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_deliverables_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_deliverables_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          created_at: string
          deliverable_id: string | null
          id: string
          role: string
          sender_id: string | null
          thread_id: string
          tool_calls: Json | null
          tool_name: string | null
        }
        Insert: {
          content: string
          created_at?: string
          deliverable_id?: string | null
          id?: string
          role: string
          sender_id?: string | null
          thread_id: string
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          deliverable_id?: string | null
          id?: string
          role?: string
          sender_id?: string | null
          thread_id?: string
          tool_calls?: Json | null
          tool_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "agent_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "agent_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_operations: {
        Row: {
          client_channel: string
          created_at: string
          id: string
          last_error: string | null
          lease_until: string | null
          org_id: string
          request_hash: string
          request_message: string | null
          request_thread_id: string | null
          response: Json | null
          runner: string | null
          status: string
          steps: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          client_channel: string
          created_at?: string
          id: string
          last_error?: string | null
          lease_until?: string | null
          org_id: string
          request_hash: string
          request_message?: string | null
          request_thread_id?: string | null
          response?: Json | null
          runner?: string | null
          status?: string
          steps?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          client_channel?: string
          created_at?: string
          id?: string
          last_error?: string | null
          lease_until?: string | null
          org_id?: string
          request_hash?: string
          request_message?: string | null
          request_thread_id?: string | null
          response?: Json | null
          runner?: string | null
          status?: string
          steps?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_operations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_operations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_threads: {
        Row: {
          created_at: string
          id: string
          last_message_at: string | null
          org_id: string
          participants: string[] | null
          thread_type: string
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          org_id: string
          participants?: string[] | null
          thread_type?: string
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message_at?: string | null
          org_id?: string
          participants?: string[] | null
          thread_type?: string
          title?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_write_receipts: {
        Row: {
          created_at: string
          input: Json
          operation_id: string
          result: Json
          step: string
          user_id: string
        }
        Insert: {
          created_at?: string
          input: Json
          operation_id: string
          result: Json
          step: string
          user_id: string
        }
        Update: {
          created_at?: string
          input?: Json
          operation_id?: string
          result?: Json
          step?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_write_receipts_user_id_operation_id_fkey"
            columns: ["user_id", "operation_id"]
            isOneToOne: false
            referencedRelation: "agent_operations"
            referencedColumns: ["user_id", "id"]
          },
        ]
      }
      app_error_events: {
        Row: {
          fingerprint: string
          first_seen_at: string
          id: string
          last_seen_at: string
          message: string
          metadata: Json
          occurrence_count: number
          org_id: string
          release: string | null
          route: string | null
          source: string
          stack: string | null
          user_id: string | null
        }
        Insert: {
          fingerprint: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message: string
          metadata?: Json
          occurrence_count?: number
          org_id: string
          release?: string | null
          route?: string | null
          source: string
          stack?: string | null
          user_id?: string | null
        }
        Update: {
          fingerprint?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          message?: string
          metadata?: Json
          occurrence_count?: number
          org_id?: string
          release?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_error_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_error_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_invites: {
        Row: {
          claimed_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string | null
          org_id: string
          role: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by?: string | null
          org_id: string
          role?: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string | null
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          activity_category: string | null
          authenticated_actor_id: string | null
          automation: boolean | null
          change_summary: string | null
          client_channel: string | null
          client_event_id: string | null
          created_at: string
          effective_actor_id: string | null
          id: string
          new_data: Json | null
          old_data: Json | null
          operation_id: string | null
          org_id: string
          record_id: string
          record_label: string | null
          source: string
          table_name: string
          user_id: string | null
        }
        Insert: {
          action: string
          activity_category?: string | null
          authenticated_actor_id?: string | null
          automation?: boolean | null
          change_summary?: string | null
          client_channel?: string | null
          client_event_id?: string | null
          created_at?: string
          effective_actor_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation_id?: string | null
          org_id: string
          record_id: string
          record_label?: string | null
          source?: string
          table_name: string
          user_id?: string | null
        }
        Update: {
          action?: string
          activity_category?: string | null
          authenticated_actor_id?: string | null
          automation?: boolean | null
          change_summary?: string | null
          client_channel?: string | null
          client_event_id?: string | null
          created_at?: string
          effective_actor_id?: string | null
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          operation_id?: string | null
          org_id?: string
          record_id?: string
          record_label?: string | null
          source?: string
          table_name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profile: {
        Row: {
          business_name: string
          facts: Json
          guardrails: Json
          logo_storage_path: string | null
          org_id: string
          persona_name: string
          persona_role: string | null
          persona_style: string | null
          tagline: string | null
          updated_at: string
        }
        Insert: {
          business_name: string
          facts?: Json
          guardrails?: Json
          logo_storage_path?: string | null
          org_id: string
          persona_name?: string
          persona_role?: string | null
          persona_style?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string
          facts?: Json
          guardrails?: Json
          logo_storage_path?: string | null
          org_id?: string
          persona_name?: string
          persona_role?: string | null
          persona_style?: string | null
          tagline?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_profile_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_thread_reads: {
        Row: {
          last_read_at: string
          org_id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          org_id: string
          thread_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          org_id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_thread_reads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_thread_reads_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_threads: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          last_message_at: string | null
          org_id: string
          thread_type: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          org_id: string
          thread_type?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          org_id?: string
          thread_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_threads_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_threads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          assigned_to: string | null
          created_at: string
          customer_type: string
          email: string | null
          first_name: string
          id: string
          last_activity_at: string | null
          last_name: string
          lead_source: string
          location_id: string | null
          mailing_address: string | null
          org_id: string
          phone: string
          phone_secondary: string | null
          qb_customer_id: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          customer_type?: string
          email?: string | null
          first_name: string
          id?: string
          last_activity_at?: string | null
          last_name: string
          lead_source?: string
          location_id?: string | null
          mailing_address?: string | null
          org_id: string
          phone: string
          phone_secondary?: string | null
          qb_customer_id?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          customer_type?: string
          email?: string | null
          first_name?: string
          id?: string
          last_activity_at?: string | null
          last_name?: string
          lead_source?: string
          location_id?: string | null
          mailing_address?: string | null
          org_id?: string
          phone?: string
          phone_secondary?: string | null
          qb_customer_id?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_equipment: {
        Row: {
          contact_id: string
          created_at: string
          created_by: string
          id: string
          inventory_item_id: string | null
          manufacturer: string | null
          model: string
          model_year: number | null
          org_id: string
          retired_at: string | null
          serial_number: string | null
          source_note: string
          updated_at: string
          warranty_source: string | null
        }
        Insert: {
          contact_id: string
          created_at?: string
          created_by?: string
          id?: string
          inventory_item_id?: string | null
          manufacturer?: string | null
          model: string
          model_year?: number | null
          org_id: string
          retired_at?: string | null
          serial_number?: string | null
          source_note: string
          updated_at?: string
          warranty_source?: string | null
        }
        Update: {
          contact_id?: string
          created_at?: string
          created_by?: string
          id?: string
          inventory_item_id?: string | null
          manufacturer?: string | null
          model?: string
          model_year?: number | null
          org_id?: string
          retired_at?: string | null
          serial_number?: string | null
          source_note?: string
          updated_at?: string
          warranty_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_equipment_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_equipment_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_equipment_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_equipment_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deal_assignment_history: {
        Row: {
          assigned_to: string | null
          changed_at: string
          changed_by: string | null
          deal_id: string
          id: string
          org_id: string
          previous_user_id: string | null
        }
        Insert: {
          assigned_to?: string | null
          changed_at?: string
          changed_by?: string | null
          deal_id: string
          id?: string
          org_id: string
          previous_user_id?: string | null
        }
        Update: {
          assigned_to?: string | null
          changed_at?: string
          changed_by?: string | null
          deal_id?: string
          id?: string
          org_id?: string
          previous_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deal_assignment_history_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_assignment_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_assignment_history_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_assignment_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deal_assignment_history_previous_user_id_fkey"
            columns: ["previous_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          amount: number | null
          amount_exception_at: string | null
          amount_exception_by: string | null
          amount_exception_note: string | null
          assigned_to: string
          closed_at: string | null
          closed_credit_user_id: string | null
          contact_id: string
          created_at: string
          expected_close_date: string | null
          id: string
          inventory_item_id: string | null
          lead_review_due_at: string | null
          lead_review_note: string | null
          lead_review_state: string | null
          lead_reviewed_at: string | null
          lead_reviewed_by: string | null
          lead_source: string
          location_id: string | null
          lost_reason: string | null
          org_id: string
          position: number
          priority: string
          product_interest: string[] | null
          sale_fulfillment_type: string | null
          stage_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          amount_exception_at?: string | null
          amount_exception_by?: string | null
          amount_exception_note?: string | null
          assigned_to: string
          closed_at?: string | null
          closed_credit_user_id?: string | null
          contact_id: string
          created_at?: string
          expected_close_date?: string | null
          id?: string
          inventory_item_id?: string | null
          lead_review_due_at?: string | null
          lead_review_note?: string | null
          lead_review_state?: string | null
          lead_reviewed_at?: string | null
          lead_reviewed_by?: string | null
          lead_source?: string
          location_id?: string | null
          lost_reason?: string | null
          org_id: string
          position?: number
          priority?: string
          product_interest?: string[] | null
          sale_fulfillment_type?: string | null
          stage_id: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          amount_exception_at?: string | null
          amount_exception_by?: string | null
          amount_exception_note?: string | null
          assigned_to?: string
          closed_at?: string | null
          closed_credit_user_id?: string | null
          contact_id?: string
          created_at?: string
          expected_close_date?: string | null
          id?: string
          inventory_item_id?: string | null
          lead_review_due_at?: string | null
          lead_review_note?: string | null
          lead_review_state?: string | null
          lead_reviewed_at?: string | null
          lead_reviewed_by?: string | null
          lead_source?: string
          location_id?: string | null
          lost_reason?: string | null
          org_id?: string
          position?: number
          priority?: string
          product_interest?: string[] | null
          sale_fulfillment_type?: string | null
          stage_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_amount_exception_by_fkey"
            columns: ["amount_exception_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_closed_credit_user_id_fkey"
            columns: ["closed_credit_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_lead_reviewed_by_fkey"
            columns: ["lead_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      delegated_checklist_templates: {
        Row: {
          active: boolean
          assigned_to: string
          created_at: string
          created_by: string
          due_time: string
          id: string
          items: string[]
          last_generated_on: string | null
          location_id: string | null
          name: string
          org_id: string
          proof_required: boolean
          updated_at: string
          weekdays: number[]
        }
        Insert: {
          active?: boolean
          assigned_to: string
          created_at?: string
          created_by: string
          due_time?: string
          id?: string
          items: string[]
          last_generated_on?: string | null
          location_id?: string | null
          name: string
          org_id: string
          proof_required?: boolean
          updated_at?: string
          weekdays?: number[]
        }
        Update: {
          active?: boolean
          assigned_to?: string
          created_at?: string
          created_by?: string
          due_time?: string
          id?: string
          items?: string[]
          last_generated_on?: string | null
          location_id?: string | null
          name?: string
          org_id?: string
          proof_required?: boolean
          updated_at?: string
          weekdays?: number[]
        }
        Relationships: [
          {
            foreignKeyName: "delegated_checklist_templates_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegated_checklist_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegated_checklist_templates_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delegated_checklist_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      fix_it_access_members: {
        Row: {
          granted_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          org_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fix_it_access_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_access_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fix_it_attachments: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          mime_type: string | null
          name: string
          org_id: string
          post_id: string
          purpose: string
          size: string | null
          storage_path: string | null
          type: string | null
          uploaded_by: string | null
          url: string | null
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          name: string
          org_id: string
          post_id: string
          purpose?: string
          size?: string | null
          storage_path?: string | null
          type?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          mime_type?: string | null
          name?: string
          org_id?: string
          post_id?: string
          purpose?: string
          size?: string | null
          storage_path?: string | null
          type?: string | null
          uploaded_by?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fix_it_attachments_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "fix_it_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_attachments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_attachments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "fix_it_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fix_it_comments: {
        Row: {
          body: string | null
          created_at: string
          created_by: string
          id: string
          org_id: string
          post_id: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          post_id: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fix_it_comments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "fix_it_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      fix_it_posts: {
        Row: {
          agent_tested_at: string | null
          agent_tested_by: string | null
          archived_at: string | null
          archived_by: string | null
          body: string | null
          claimed_by: string | null
          created_at: string
          created_by: string
          dedupe_key: string | null
          human_reviewed_at: string | null
          human_reviewed_by: string | null
          id: string
          org_id: string
          reopen_count: number
          reopened_at: string | null
          reopened_by: string | null
          reopened_from_status: string | null
          source: string | null
          source_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          agent_tested_at?: string | null
          agent_tested_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          body?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by: string
          dedupe_key?: string | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          id?: string
          org_id: string
          reopen_count?: number
          reopened_at?: string | null
          reopened_by?: string | null
          reopened_from_status?: string | null
          source?: string | null
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          agent_tested_at?: string | null
          agent_tested_by?: string | null
          archived_at?: string | null
          archived_by?: string | null
          body?: string | null
          claimed_by?: string | null
          created_at?: string
          created_by?: string
          dedupe_key?: string | null
          human_reviewed_at?: string | null
          human_reviewed_by?: string | null
          id?: string
          org_id?: string
          reopen_count?: number
          reopened_at?: string | null
          reopened_by?: string | null
          reopened_from_status?: string | null
          source?: string | null
          source_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fix_it_posts_agent_tested_by_fkey"
            columns: ["agent_tested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_posts_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_posts_claimed_by_fkey"
            columns: ["claimed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_posts_human_reviewed_by_fkey"
            columns: ["human_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_posts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fix_it_posts_reopened_by_fkey"
            columns: ["reopened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_flooring_rows: {
        Row: {
          background_color: string | null
          inventory_item_id: string
          org_id: string
          report_removed_at: string | null
          report_removed_by: string | null
          status_text: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          background_color?: string | null
          inventory_item_id: string
          org_id: string
          report_removed_at?: string | null
          report_removed_by?: string | null
          status_text?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          background_color?: string | null
          inventory_item_id?: string
          org_id?: string
          report_removed_at?: string | null
          report_removed_by?: string | null
          status_text?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "inventory_flooring_rows_inventory_org_fk"
            columns: ["inventory_item_id", "org_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "inventory_flooring_rows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_flooring_rows_report_removed_by_fkey"
            columns: ["report_removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_flooring_rows_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_items: {
        Row: {
          brand: string | null
          category: string
          color_finish: string | null
          cost: number | null
          created_at: string
          customer_id: string | null
          date_delivered: string | null
          date_received: string | null
          date_sold: string | null
          deal_id: string | null
          flooring_amount: number | null
          id: string
          job_id: string | null
          location_id: string
          model: string | null
          msrp: number | null
          notes: string | null
          order_date: string | null
          org_id: string
          primary_image_mime_type: string | null
          primary_image_storage_path: string | null
          product: string
          removed_at: string | null
          removed_by: string | null
          sale_price: number | null
          sku: string
          status: string
          stock_state: string | null
          updated_at: string
          warranty_info: string | null
        }
        Insert: {
          brand?: string | null
          category: string
          color_finish?: string | null
          cost?: number | null
          created_at?: string
          customer_id?: string | null
          date_delivered?: string | null
          date_received?: string | null
          date_sold?: string | null
          deal_id?: string | null
          flooring_amount?: number | null
          id?: string
          job_id?: string | null
          location_id: string
          model?: string | null
          msrp?: number | null
          notes?: string | null
          order_date?: string | null
          org_id: string
          primary_image_mime_type?: string | null
          primary_image_storage_path?: string | null
          product: string
          removed_at?: string | null
          removed_by?: string | null
          sale_price?: number | null
          sku: string
          status?: string
          stock_state?: string | null
          updated_at?: string
          warranty_info?: string | null
        }
        Update: {
          brand?: string | null
          category?: string
          color_finish?: string | null
          cost?: number | null
          created_at?: string
          customer_id?: string | null
          date_delivered?: string | null
          date_received?: string | null
          date_sold?: string | null
          deal_id?: string | null
          flooring_amount?: number | null
          id?: string
          job_id?: string | null
          location_id?: string
          model?: string | null
          msrp?: number | null
          notes?: string | null
          order_date?: string | null
          org_id?: string
          primary_image_mime_type?: string | null
          primary_image_storage_path?: string | null
          product?: string
          removed_at?: string | null
          removed_by?: string | null
          sale_price?: number | null
          sku?: string
          status?: string
          stock_state?: string | null
          updated_at?: string
          warranty_info?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_items_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_assignments: {
        Row: {
          created_at: string
          id: string
          job_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_collection_requests: {
        Row: {
          created_at: string
          id: string
          job_id: string
          org_id: string
          proposed_amount: number
          reason: string
          requested_by: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          org_id: string
          proposed_amount: number
          reason: string
          requested_by?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          org_id?: string
          proposed_amount?: number
          reason?: string
          requested_by?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_collection_requests_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_collection_requests_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_collection_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_collection_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_photos: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string
          id: string
          job_id: string
          photo_type: string
          storage_path: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by: string
          id?: string
          job_id: string
          photo_type?: string
          storage_path: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string
          id?: string
          job_id?: string
          photo_type?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_photos_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_photos_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          amount_to_collect: number | null
          contact_id: string
          created_at: string
          created_by: string
          description: string | null
          equipment_id: string | null
          estimated_duration: number | null
          exception_due_at: string | null
          exception_next_action: string | null
          exception_owner_id: string | null
          exception_reason: string | null
          exception_reviewed_at: string | null
          id: string
          job_type: string
          location_id: string
          org_id: string
          priority: string | null
          property_id: string | null
          scheduled_all_day: boolean
          scheduled_at: string | null
          scheduled_end_date: string | null
          service_level: number | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          amount_to_collect?: number | null
          contact_id: string
          created_at?: string
          created_by: string
          description?: string | null
          equipment_id?: string | null
          estimated_duration?: number | null
          exception_due_at?: string | null
          exception_next_action?: string | null
          exception_owner_id?: string | null
          exception_reason?: string | null
          exception_reviewed_at?: string | null
          id?: string
          job_type?: string
          location_id: string
          org_id: string
          priority?: string | null
          property_id?: string | null
          scheduled_all_day?: boolean
          scheduled_at?: string | null
          scheduled_end_date?: string | null
          service_level?: number | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          amount_to_collect?: number | null
          contact_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          equipment_id?: string | null
          estimated_duration?: number | null
          exception_due_at?: string | null
          exception_next_action?: string | null
          exception_owner_id?: string | null
          exception_reason?: string | null
          exception_reviewed_at?: string | null
          id?: string
          job_type?: string
          location_id?: string
          org_id?: string
          priority?: string | null
          property_id?: string | null
          scheduled_all_day?: boolean
          scheduled_at?: string | null
          scheduled_end_date?: string | null
          service_level?: number | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "customer_equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_exception_owner_id_fkey"
            columns: ["exception_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          char_count: number | null
          chunk_index: number
          content: string
          content_sha256: string | null
          created_at: string
          document_id: string
          embedding: string | null
          fts: unknown
          heading: string | null
          id: string
          models: string[]
          org_id: string
          page_end: number | null
          page_start: number | null
          part_numbers: string[]
          section_path: string[]
        }
        Insert: {
          char_count?: number | null
          chunk_index: number
          content: string
          content_sha256?: string | null
          created_at?: string
          document_id: string
          embedding?: string | null
          fts?: unknown
          heading?: string | null
          id?: string
          models?: string[]
          org_id: string
          page_end?: number | null
          page_start?: number | null
          part_numbers?: string[]
          section_path?: string[]
        }
        Update: {
          char_count?: number | null
          chunk_index?: number
          content?: string
          content_sha256?: string | null
          created_at?: string
          document_id?: string
          embedding?: string | null
          fts?: unknown
          heading?: string | null
          id?: string
          models?: string[]
          org_id?: string
          page_end?: number | null
          page_start?: number | null
          part_numbers?: string[]
          section_path?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          access_scope: string
          citation_label: string | null
          confidentiality_note: string | null
          created_at: string
          created_by: string | null
          doc_type: string
          effective_at: string | null
          expires_at: string | null
          file_size_bytes: number | null
          id: string
          manufacturer: string | null
          mime_type: string | null
          model_year_end: number | null
          model_year_start: number | null
          org_id: string
          review_due_at: string | null
          review_owner_id: string | null
          review_required: boolean
          revision: string | null
          source_key: string | null
          source_kind: string
          source_sha256: string | null
          source_url: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          supersedes_document_id: string | null
          title: string
          updated_at: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          access_scope?: string
          citation_label?: string | null
          confidentiality_note?: string | null
          created_at?: string
          created_by?: string | null
          doc_type: string
          effective_at?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          manufacturer?: string | null
          mime_type?: string | null
          model_year_end?: number | null
          model_year_start?: number | null
          org_id: string
          review_due_at?: string | null
          review_owner_id?: string | null
          review_required?: boolean
          revision?: string | null
          source_key?: string | null
          source_kind?: string
          source_sha256?: string | null
          source_url?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          supersedes_document_id?: string | null
          title: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          access_scope?: string
          citation_label?: string | null
          confidentiality_note?: string | null
          created_at?: string
          created_by?: string | null
          doc_type?: string
          effective_at?: string | null
          expires_at?: string | null
          file_size_bytes?: number | null
          id?: string
          manufacturer?: string | null
          mime_type?: string | null
          model_year_end?: number | null
          model_year_start?: number | null
          org_id?: string
          review_due_at?: string | null
          review_owner_id?: string | null
          review_required?: boolean
          revision?: string | null
          source_key?: string | null
          source_kind?: string
          source_sha256?: string | null
          source_url?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          supersedes_document_id?: string | null
          title?: string
          updated_at?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_review_owner_id_fkey"
            columns: ["review_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_supersedes_document_id_fkey"
            columns: ["supersedes_document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_ingestion_runs: {
        Row: {
          chunk_count: number
          created_at: string
          detail: string | null
          document_id: string | null
          id: string
          org_id: string
          source_key: string
          source_sha256: string
          status: string
        }
        Insert: {
          chunk_count: number
          created_at?: string
          detail?: string | null
          document_id?: string | null
          id?: string
          org_id: string
          source_key: string
          source_sha256: string
          status: string
        }
        Update: {
          chunk_count?: number
          created_at?: string
          detail?: string | null
          document_id?: string | null
          id?: string
          org_id?: string
          source_key?: string
          source_sha256?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_ingestion_runs_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_ingestion_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_part_applications: {
        Row: {
          component: string
          created_at: string
          id: string
          manufacturer: string
          model: string
          model_year_end: number | null
          model_year_start: number | null
          org_id: string
          page_end: number | null
          page_start: number | null
          part_number: string
          quantity: number | null
          source_document_id: string
          updated_at: string
          variant: string | null
          verification_note: string | null
          verified_at: string
        }
        Insert: {
          component: string
          created_at?: string
          id?: string
          manufacturer: string
          model: string
          model_year_end?: number | null
          model_year_start?: number | null
          org_id: string
          page_end?: number | null
          page_start?: number | null
          part_number: string
          quantity?: number | null
          source_document_id: string
          updated_at?: string
          variant?: string | null
          verification_note?: string | null
          verified_at?: string
        }
        Update: {
          component?: string
          created_at?: string
          id?: string
          manufacturer?: string
          model?: string
          model_year_end?: number | null
          model_year_start?: number | null
          org_id?: string
          page_end?: number | null
          page_start?: number | null
          part_number?: string
          quantity?: number | null
          source_document_id?: string
          updated_at?: string
          variant?: string | null
          verification_note?: string | null
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_part_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_part_applications_source_document_id_fkey"
            columns: ["source_document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_reviews: {
        Row: {
          created_at: string
          document_id: string
          id: string
          note: string
          org_id: string
          review_due_at: string
          review_owner_id: string | null
          reviewed_by: string
          source_checked: boolean
        }
        Insert: {
          created_at?: string
          document_id: string
          id?: string
          note: string
          org_id: string
          review_due_at: string
          review_owner_id?: string | null
          reviewed_by: string
          source_checked: boolean
        }
        Update: {
          created_at?: string
          document_id?: string
          id?: string
          note?: string
          org_id?: string
          review_due_at?: string
          review_owner_id?: string | null
          reviewed_by?: string
          source_checked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_reviews_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_reviews_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_reviews_review_owner_id_fkey"
            columns: ["review_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_reviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          name: string
          org_id: string
          phone: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          name: string
          org_id: string
          phone?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string | null
          sender_type: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_type: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string | null
          sender_type?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_changes: {
        Row: {
          after_data: Json
          before_data: Json | null
          created_at: string
          destination_id: string
          destination_table: string
          id: string
          operation: string
          org_id: string
          rolled_back_at: string | null
          run_id: string
          source_record_id: string | null
        }
        Insert: {
          after_data: Json
          before_data?: Json | null
          created_at?: string
          destination_id: string
          destination_table: string
          id?: string
          operation: string
          org_id: string
          rolled_back_at?: string | null
          run_id: string
          source_record_id?: string | null
        }
        Update: {
          after_data?: Json
          before_data?: Json | null
          created_at?: string
          destination_id?: string
          destination_table?: string
          id?: string
          operation?: string
          org_id?: string
          rolled_back_at?: string | null
          run_id?: string
          source_record_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_changes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_changes_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "migration_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_changes_source_record_id_fkey"
            columns: ["source_record_id"]
            isOneToOne: false
            referencedRelation: "migration_source_records"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_connections: {
        Row: {
          connected_at: string
          connected_by: string
          created_at: string
          credentials_ciphertext: string
          external_account_id: string | null
          external_account_name: string | null
          id: string
          last_error: string | null
          last_scan_at: string | null
          org_id: string
          provider: string
          scopes: string[]
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          connected_at?: string
          connected_by: string
          created_at?: string
          credentials_ciphertext: string
          external_account_id?: string | null
          external_account_name?: string | null
          id?: string
          last_error?: string | null
          last_scan_at?: string | null
          org_id: string
          provider: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          connected_at?: string
          connected_by?: string
          created_at?: string
          credentials_ciphertext?: string
          external_account_id?: string | null
          external_account_name?: string | null
          id?: string
          last_error?: string | null
          last_scan_at?: string | null
          org_id?: string
          provider?: string
          scopes?: string[]
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_connections_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_events: {
        Row: {
          actor_id: string | null
          connection_id: string | null
          created_at: string
          detail: Json
          event_type: string
          id: number
          org_id: string
          run_id: string | null
        }
        Insert: {
          actor_id?: string | null
          connection_id?: string | null
          created_at?: string
          detail?: Json
          event_type: string
          id?: never
          org_id: string
          run_id?: string | null
        }
        Update: {
          actor_id?: string | null
          connection_id?: string | null
          created_at?: string
          detail?: Json
          event_type?: string
          id?: never
          org_id?: string
          run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "migration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "migration_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_external_links: {
        Row: {
          created_at: string
          destination_id: string
          destination_table: string
          first_run_id: string | null
          id: string
          last_run_id: string | null
          last_source_updated_at: string | null
          object_type: string
          org_id: string
          provider: string
          source_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          destination_id: string
          destination_table: string
          first_run_id?: string | null
          id?: string
          last_run_id?: string | null
          last_source_updated_at?: string | null
          object_type: string
          org_id: string
          provider: string
          source_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          destination_id?: string
          destination_table?: string
          first_run_id?: string | null
          id?: string
          last_run_id?: string | null
          last_source_updated_at?: string | null
          object_type?: string
          org_id?: string
          provider?: string
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_external_links_first_run_id_fkey"
            columns: ["first_run_id"]
            isOneToOne: false
            referencedRelation: "migration_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_external_links_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "migration_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_external_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_oauth_states: {
        Row: {
          consumed_at: string | null
          created_at: string
          expires_at: string
          org_id: string
          provider: string
          return_to: string
          state_hash: string
          user_id: string
          verifier_ciphertext: string | null
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          expires_at: string
          org_id: string
          provider: string
          return_to?: string
          state_hash: string
          user_id: string
          verifier_ciphertext?: string | null
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          org_id?: string
          provider?: string
          return_to?: string
          state_hash?: string
          user_id?: string
          verifier_ciphertext?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "migration_oauth_states_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_oauth_states_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_runs: {
        Row: {
          completed_at: string | null
          connection_id: string | null
          created_at: string
          cursor: Json
          error: string | null
          id: string
          org_id: string
          phase: string
          progress: number
          provider: string
          run_type: string
          source_run_id: string | null
          started_at: string | null
          started_by: string
          status: string
          totals: Json
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          cursor?: Json
          error?: string | null
          id?: string
          org_id: string
          phase?: string
          progress?: number
          provider: string
          run_type: string
          source_run_id?: string | null
          started_at?: string | null
          started_by: string
          status?: string
          totals?: Json
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          connection_id?: string | null
          created_at?: string
          cursor?: Json
          error?: string | null
          id?: string
          org_id?: string
          phase?: string
          progress?: number
          provider?: string
          run_type?: string
          source_run_id?: string | null
          started_at?: string | null
          started_by?: string
          status?: string
          totals?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_runs_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "migration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_runs_source_run_id_fkey"
            columns: ["source_run_id"]
            isOneToOne: false
            referencedRelation: "migration_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_runs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      migration_source_records: {
        Row: {
          checksum: string
          connection_id: string
          created_at: string
          destination_id: string | null
          destination_table: string | null
          disposition: string
          id: string
          issues: Json
          normalized: Json
          object_type: string
          org_id: string
          provider: string
          raw: Json
          run_id: string
          source_id: string
          source_updated_at: string | null
          updated_at: string
        }
        Insert: {
          checksum: string
          connection_id: string
          created_at?: string
          destination_id?: string | null
          destination_table?: string | null
          disposition?: string
          id?: string
          issues?: Json
          normalized?: Json
          object_type: string
          org_id: string
          provider: string
          raw: Json
          run_id: string
          source_id: string
          source_updated_at?: string | null
          updated_at?: string
        }
        Update: {
          checksum?: string
          connection_id?: string
          created_at?: string
          destination_id?: string | null
          destination_table?: string | null
          disposition?: string
          id?: string
          issues?: Json
          normalized?: Json
          object_type?: string
          org_id?: string
          provider?: string
          raw?: Json
          run_id?: string
          source_id?: string
          source_updated_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "migration_source_records_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "migration_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_source_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "migration_source_records_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "migration_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      morning_summary_emails: {
        Row: {
          created_at: string
          day: string
          error: string | null
          id: string
          org_id: string
          provider_checked_at: string | null
          provider_event: string | null
          provider_event_at: string | null
          provider_id: string | null
          status: string
          to_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day: string
          error?: string | null
          id?: string
          org_id: string
          provider_checked_at?: string | null
          provider_event?: string | null
          provider_event_at?: string | null
          provider_id?: string | null
          status?: string
          to_email: string
          user_id: string
        }
        Update: {
          created_at?: string
          day?: string
          error?: string | null
          id?: string
          org_id?: string
          provider_checked_at?: string | null
          provider_event?: string | null
          provider_event_at?: string | null
          provider_id?: string | null
          status?: string
          to_email?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "morning_summary_emails_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "morning_summary_emails_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      morning_summary_narrations: {
        Row: {
          created_at: string
          created_by: string | null
          data_as_of: string | null
          day: string
          model: string | null
          narration: string
          org_id: string
          source_hash: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data_as_of?: string | null
          day: string
          model?: string | null
          narration: string
          org_id: string
          source_hash?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data_as_of?: string | null
          day?: string
          model?: string | null
          narration?: string
          org_id?: string
          source_hash?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "morning_summary_narrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "morning_summary_narrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          contact_id: string | null
          created_at: string
          created_by: string
          deal_id: string | null
          edited_at: string | null
          edited_by: string | null
          id: string
          job_id: string | null
        }
        Insert: {
          body: string
          contact_id?: string | null
          created_at?: string
          created_by: string
          deal_id?: string | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          job_id?: string | null
        }
        Update: {
          body?: string
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deal_id?: string | null
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          job_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_delivery_status: {
        Row: {
          accepted: number
          checked_at: string | null
          detail: string | null
          expired: number
          failed: number
          notification_id: string
          org_id: string
          requested_at: string
          state: string
          subscriptions: number
          user_id: string
        }
        Insert: {
          accepted?: number
          checked_at?: string | null
          detail?: string | null
          expired?: number
          failed?: number
          notification_id: string
          org_id: string
          requested_at?: string
          state: string
          subscriptions?: number
          user_id: string
        }
        Update: {
          accepted?: number
          checked_at?: string | null
          detail?: string | null
          expired?: number
          failed?: number
          notification_id?: string
          org_id?: string
          requested_at?: string
          state?: string
          subscriptions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_delivery_status_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_status_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_delivery_status_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          marked_read_at: string | null
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          marked_read_at?: string | null
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          marked_read_at?: string | null
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      owner_activity_viewers: {
        Row: {
          granted_at: string
          org_id: string
          user_id: string
        }
        Insert: {
          granted_at?: string
          org_id: string
          user_id: string
        }
        Update: {
          granted_at?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_activity_viewers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_workbooks: {
        Row: {
          created_at: string
          created_by: string
          current_sha256: string
          display_name: string
          file_size_bytes: number
          folder_key: string
          id: string
          mime_type: string
          org_id: string
          source_sha256: string
          storage_path: string
          updated_at: string
          updated_by: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          current_sha256: string
          display_name: string
          file_size_bytes: number
          folder_key: string
          id?: string
          mime_type?: string
          org_id: string
          source_sha256: string
          storage_path: string
          updated_at?: string
          updated_by: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          current_sha256?: string
          display_name?: string
          file_size_bytes?: number
          folder_key?: string
          id?: string
          mime_type?: string
          org_id?: string
          source_sha256?: string
          storage_path?: string
          updated_at?: string
          updated_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "owner_workbooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_workbooks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_workbooks_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paid_commissions: {
        Row: {
          commission_amount: number | null
          commission_month: string
          commission_percentage: number
          created_at: string
          created_by: string
          customer_name: string
          id: string
          org_id: string
          paid_on: string
          sale_amount: number
          salesperson_name: string
          updated_at: string
        }
        Insert: {
          commission_amount?: number | null
          commission_month: string
          commission_percentage: number
          created_at?: string
          created_by: string
          customer_name: string
          id?: string
          org_id: string
          paid_on?: string
          sale_amount: number
          salesperson_name: string
          updated_at?: string
        }
        Update: {
          commission_amount?: number | null
          commission_month?: string
          commission_percentage?: number
          created_at?: string
          created_by?: string
          customer_name?: string
          id?: string
          org_id?: string
          paid_on?: string
          sale_amount?: number
          salesperson_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "paid_commissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "paid_commissions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      parts: {
        Row: {
          cost: number | null
          created_at: string
          description: string
          expected_arrival: string | null
          id: string
          job_id: string
          manufacturer: string | null
          notes: string | null
          order_date: string | null
          part_number: string
          received_date: string | null
          status: string
          supplier: string | null
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          cost?: number | null
          created_at?: string
          description: string
          expected_arrival?: string | null
          id?: string
          job_id: string
          manufacturer?: string | null
          notes?: string | null
          order_date?: string | null
          part_number: string
          received_date?: string | null
          status?: string
          supplier?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          cost?: number | null
          created_at?: string
          description?: string
          expected_arrival?: string | null
          id?: string
          job_id?: string
          manufacturer?: string | null
          notes?: string | null
          order_date?: string | null
          part_number?: string
          received_date?: string | null
          status?: string
          supplier?: string | null
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parts_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          org_id: string
          position: number
          probability: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          org_id: string
          position: number
          probability?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          org_id?: string
          position?: number
          probability?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_attributes: {
        Row: {
          attrs: Json
          color: string | null
          gallons: number | null
          height_in: number | null
          item_id: string
          jets: number | null
          length_in: number | null
          lounge: boolean | null
          org_id: string
          seats: number | null
          series: string | null
          swim_level: string | null
          updated_at: string
          voltage: string | null
          width_in: number | null
        }
        Insert: {
          attrs?: Json
          color?: string | null
          gallons?: number | null
          height_in?: number | null
          item_id: string
          jets?: number | null
          length_in?: number | null
          lounge?: boolean | null
          org_id: string
          seats?: number | null
          series?: string | null
          swim_level?: string | null
          updated_at?: string
          voltage?: string | null
          width_in?: number | null
        }
        Update: {
          attrs?: Json
          color?: string | null
          gallons?: number | null
          height_in?: number | null
          item_id?: string
          jets?: number | null
          length_in?: number | null
          lounge?: boolean | null
          org_id?: string
          seats?: number | null
          series?: string | null
          swim_level?: string | null
          updated_at?: string
          voltage?: string | null
          width_in?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_attributes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: true
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_attributes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          location_id: string | null
          morning_summary_email: boolean
          org_id: string
          phone: string | null
          role: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          first_name: string
          id: string
          last_name: string
          location_id?: string | null
          morning_summary_email?: boolean
          org_id: string
          phone?: string | null
          role?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          location_id?: string | null
          morning_summary_email?: boolean
          org_id?: string
          phone?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      properties: {
        Row: {
          address: string
          contact_id: string
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          notes: string | null
          property_type: string
        }
        Insert: {
          address: string
          contact_id: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          property_type?: string
        }
        Update: {
          address?: string
          contact_id?: string
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          notes?: string | null
          property_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      sms_outbox: {
        Row: {
          body: string
          contact_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          deliverable_id: string | null
          error: string | null
          id: string
          org_id: string
          requested_by: string | null
          status: string
          to_phone: string
        }
        Insert: {
          body: string
          contact_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deliverable_id?: string | null
          error?: string | null
          id?: string
          org_id: string
          requested_by?: string | null
          status?: string
          to_phone: string
        }
        Update: {
          body?: string
          contact_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          deliverable_id?: string | null
          error?: string | null
          id?: string
          org_id?: string
          requested_by?: string | null
          status?: string
          to_phone?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_outbox_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_outbox_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_outbox_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "agent_deliverables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_outbox_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_quarantine: {
        Row: {
          body: string
          created_at: string
          from_phone: string
          id: string
          org_id: string
          promoted_contact_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          from_phone: string
          id?: string
          org_id: string
          promoted_contact_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          from_phone?: string
          id?: string
          org_id?: string
          promoted_contact_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sms_quarantine_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_quarantine_promoted_contact_id_fkey"
            columns: ["promoted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_time_entries: {
        Row: {
          acknowledged_incomplete_count: number
          acknowledged_task_ids: string[]
          clock_in: string
          clock_in_accuracy_m: number | null
          clock_in_ip: string | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out: string | null
          clock_out_reason: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          acknowledged_incomplete_count?: number
          acknowledged_task_ids?: string[]
          clock_in: string
          clock_in_accuracy_m?: number | null
          clock_in_ip?: string | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out?: string | null
          clock_out_reason?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          acknowledged_incomplete_count?: number
          acknowledged_task_ids?: string[]
          clock_in?: string
          clock_in_accuracy_m?: number | null
          clock_in_ip?: string | null
          clock_in_lat?: number | null
          clock_in_lng?: number | null
          clock_out?: string | null
          clock_out_reason?: string | null
          created_at?: string
          edited_at?: string | null
          edited_by?: string | null
          id?: string
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_time_entries_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      suggestions: {
        Row: {
          body: string
          created_at: string
          created_by: string
          fix_it_post_id: string | null
          id: string
          org_id: string
          resolution_note: string | null
          resolution_recorded_at: string | null
          resolution_recorded_by: string | null
          resolution_release: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by: string
          fix_it_post_id?: string | null
          id?: string
          org_id: string
          resolution_note?: string | null
          resolution_recorded_at?: string | null
          resolution_recorded_by?: string | null
          resolution_release?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          fix_it_post_id?: string | null
          id?: string
          org_id?: string
          resolution_note?: string | null
          resolution_recorded_at?: string | null
          resolution_recorded_by?: string | null
          resolution_release?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suggestions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_fix_it_post_id_fkey"
            columns: ["fix_it_post_id"]
            isOneToOne: false
            referencedRelation: "fix_it_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_resolution_recorded_by_fkey"
            columns: ["resolution_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suggestions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string
          assignee_notes: string | null
          completed_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string
          deal_id: string | null
          description: string | null
          due_at: string | null
          escalated_at: string | null
          id: string
          job_id: string | null
          nudged_at: string | null
          org_id: string
          overdue_due_at: string | null
          priority: string
          proof_photo_path: string | null
          proof_required: boolean
          sales_phase: string | null
          status: string
          task_type: string | null
          title: string
          updated_at: string
          was_overdue_at_completion: boolean
        }
        Insert: {
          assigned_to: string
          assignee_notes?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by: string
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          escalated_at?: string | null
          id?: string
          job_id?: string | null
          nudged_at?: string | null
          org_id: string
          overdue_due_at?: string | null
          priority?: string
          proof_photo_path?: string | null
          proof_required?: boolean
          sales_phase?: string | null
          status?: string
          task_type?: string | null
          title: string
          updated_at?: string
          was_overdue_at_completion?: boolean
        }
        Update: {
          assigned_to?: string
          assignee_notes?: string | null
          completed_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string
          deal_id?: string | null
          description?: string | null
          due_at?: string | null
          escalated_at?: string | null
          id?: string
          job_id?: string | null
          nudged_at?: string | null
          org_id?: string
          overdue_due_at?: string | null
          priority?: string
          proof_photo_path?: string | null
          proof_required?: boolean
          sales_phase?: string | null
          status?: string
          task_type?: string | null
          title?: string
          updated_at?: string
          was_overdue_at_completion?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          break_minutes: number | null
          created_at: string
          ended_at: string | null
          id: string
          job_id: string
          notes: string | null
          started_at: string
          user_id: string
        }
        Insert: {
          break_minutes?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          job_id: string
          notes?: string | null
          started_at: string
          user_id: string
        }
        Update: {
          break_minutes?: number | null
          created_at?: string
          ended_at?: string | null
          id?: string
          job_id?: string
          notes?: string | null
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contact_service_in_play: {
        Row: {
          active_jobs: number | null
          contact_id: string | null
          org_id: string | null
          service_amount: number | null
          service_level: number | null
          unpriced_jobs: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      agent_contact_once: {
        Args: {
          p_operation: string
          p_runner: string
          p_step: string
          p_values: Json
        }
        Returns: Json
      }
      agent_write_once: {
        Args: {
          p_id?: string
          p_kind: string
          p_match?: Json
          p_operation: string
          p_runner: string
          p_step: string
          p_table: string
          p_values: Json
        }
        Returns: Json
      }
      audit_change_summary: {
        Args: { action_key: string; new_payload: Json; old_payload: Json }
        Returns: string
      }
      audit_record_label: {
        Args: { payload: Json; table_key: string }
        Returns: string
      }
      audit_safe_uuid: { Args: { value: string }; Returns: string }
      auth_org: { Args: never; Returns: string }
      auth_role: { Args: never; Returns: string }
      can_use_fix_it: { Args: never; Returns: boolean }
      can_view_owner_activity: { Args: never; Returns: boolean }
      checkpoint_agent_operation: {
        Args: { p_id: string; p_key: string; p_runner: string; p_value: Json }
        Returns: undefined
      }
      claim_agent_operation: {
        Args: {
          p_channel: string
          p_hash: string
          p_id: string
          p_message?: string
          p_runner: string
          p_thread?: string
        }
        Returns: Json
      }
      claim_morning_delivery: {
        Args: { p_day: string; p_org: string; p_payload: Json; p_user: string }
        Returns: Json
      }
      claim_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      close_deal_sale: {
        Args: {
          p_deal_id: string
          p_fulfillment_type: string
          p_inventory_item_id?: string
          p_stage_id: string
        }
        Returns: undefined
      }
      close_deal_sale_reviewed: {
        Args: {
          p_amount: number
          p_deal_id: string
          p_exception: string
          p_fulfillment_type: string
          p_inventory_item_id: string
          p_stage_id: string
          p_task_phase: string
        }
        Returns: undefined
      }
      complete_service_job: { Args: { p_job_id: string }; Returns: string }
      consume_rate_limit: {
        Args: { p_key: string; p_max: number; p_window_seconds: number }
        Returns: Json
      }
      create_contact_guarded: {
        Args: {
          p_assigned_to?: string
          p_customer_type?: string
          p_email?: string
          p_first_name: string
          p_last_name: string
          p_lead_source?: string
          p_location_id?: string
          p_phone: string
        }
        Returns: Json
      }
      create_job_with_inventory:
        | {
            Args: {
              p_amount_to_collect: number
              p_contact_id: string
              p_description: string
              p_inventory_item_id: string
              p_job_type: string
              p_location_id: string
              p_priority: string
              p_scheduled_at: string
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_amount_to_collect: number
              p_contact_id: string
              p_description: string
              p_inventory_item_id: string
              p_job_type: string
              p_location_id: string
              p_priority: string
              p_scheduled_at: string
              p_scheduled_end_date: string
              p_title: string
            }
            Returns: string
          }
        | {
            Args: {
              p_amount_to_collect: number
              p_contact_id: string
              p_description: string
              p_inventory_item_id: string
              p_job_type: string
              p_location_id: string
              p_priority: string
              p_scheduled_all_day: boolean
              p_scheduled_at: string
              p_scheduled_end_date: string
              p_title: string
            }
            Returns: string
          }
      create_quick_deal: {
        Args: { p_deal: Json; p_next_activity_date: string; p_notes: string }
        Returns: string
      }
      dashboard_revenue_summary: {
        Args: {
          p_assigned_to: string
          p_end: string
          p_location_id: string
          p_outcome: string
          p_start: string
        }
        Returns: Json
      }
      dashboard_summary: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      data_readiness_summary: { Args: never; Returns: Json }
      delete_unscheduled_job: { Args: { p_job_id: string }; Returns: undefined }
      escalate_overdue_delegated_tasks: { Args: never; Returns: number }
      find_contact_duplicates: {
        Args: {
          p_email?: string
          p_first_name?: string
          p_last_name?: string
          p_limit?: number
          p_phone?: string
        }
        Returns: {
          assigned_to: string
          customer_type: string
          email: string
          first_name: string
          id: string
          last_name: string
          match_reason: string
          match_strength: string
          phone: string
        }[]
      }
      finish_morning_delivery: {
        Args: {
          p_email: string
          p_error: string
          p_lease: string
          p_provider: string
        }
        Returns: boolean
      }
      generate_recurring_checklists: {
        Args: { p_day?: string }
        Returns: number
      }
      ingest_knowledge_document: {
        Args: { p_chunks: Json; p_document: Json; p_org: string }
        Returns: Json
      }
      is_manager: { Args: never; Returns: boolean }
      list_communication_threads: {
        Args: { p_org: string }
        Returns: {
          contact_first_name: string
          contact_id: string
          contact_last_name: string
          contact_phone: string
          created_at: string
          id: string
          last_message_at: string
          latest_message: string
          org_id: string
          thread_type: string
          unread_count: number
        }[]
      }
      mark_communication_thread_read: {
        Args: { p_thread_id: string }
        Returns: undefined
      }
      morning_summary_for_org: {
        Args: { p_day?: string; p_org: string }
        Returns: Json
      }
      move_deal: {
        Args: { p_deal_id: string; p_position: number; p_stage_id: string }
        Returns: undefined
      }
      owner_alert_delivery: { Args: { p_hours?: number }; Returns: Json }
      owner_attention: { Args: { p_days?: number }; Returns: Json }
      owner_create_staff_time_entry: {
        Args: { p_clock_in: string; p_clock_out: string; p_user_id: string }
        Returns: {
          acknowledged_incomplete_count: number
          acknowledged_task_ids: string[]
          clock_in: string
          clock_in_accuracy_m: number | null
          clock_in_ip: string | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out: string | null
          clock_out_reason: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      owner_morning_summary: { Args: { p_day?: string }; Returns: Json }
      owner_update_staff_time_entry: {
        Args: { p_clock_in: string; p_clock_out: string; p_entry_id: string }
        Returns: {
          acknowledged_incomplete_count: number
          acknowledged_task_ids: string[]
          clock_in: string
          clock_in_accuracy_m: number | null
          clock_in_ip: string | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out: string | null
          clock_out_reason: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_app_activity: {
        Args: { p_event_type: string; p_label: string; p_source?: string }
        Returns: string
      }
      record_app_activity_v2: {
        Args: {
          p_channel?: string
          p_event_id: string
          p_label: string
          p_release: string
          p_route: string
          p_session_id: string
        }
        Returns: string
      }
      record_app_error: {
        Args: {
          p_fingerprint: string
          p_message: string
          p_metadata?: Json
          p_release?: string
          p_route?: string
          p_source: string
          p_stack?: string
        }
        Returns: string
      }
      record_morning_provider_event: {
        Args: {
          p_at: string
          p_event: string
          p_kind: string
          p_provider: string
        }
        Returns: boolean
      }
      remove_inventory_item: {
        Args: { p_inventory_item_id: string }
        Returns: string
      }
      replace_job_inventory: {
        Args: { p_inventory_item_ids: string[]; p_job_id: string }
        Returns: undefined
      }
      reports_summary: {
        Args: { p_end: string; p_start: string }
        Returns: Json
      }
      review_collection_request: {
        Args: { p_apply: boolean; p_id: string; p_note: string }
        Returns: boolean
      }
      review_knowledge_source: {
        Args: {
          p_checked: boolean
          p_document: string
          p_due: string
          p_note: string
          p_owner: string
          p_version: string
        }
        Returns: undefined
      }
      review_sale_followups: {
        Args: { p_deal: string; p_phase: string }
        Returns: number
      }
      search_knowledge: {
        Args: {
          p_doc_types?: string[]
          p_limit?: number
          p_org: string
          p_query: string
        }
        Returns: {
          content: string
          doc_type: string
          document_id: string
          heading: string
          rank: number
          title: string
        }[]
      }
      search_knowledge_v2: {
        Args: {
          p_access_scope?: string
          p_doc_types?: string[]
          p_limit?: number
          p_org: string
          p_query: string
        }
        Returns: {
          access_scope: string
          chunk_id: string
          citation_label: string
          content: string
          doc_type: string
          document_id: string
          heading: string
          manufacturer: string
          models: string[]
          page_end: number
          page_start: number
          part_numbers: string[]
          rank: number
          revision: string
          source_url: string
          title: string
        }[]
      }
      send_daily_reminders: { Args: never; Returns: undefined }
      send_morning_summary_email: { Args: never; Returns: undefined }
      send_morning_summary_notice: { Args: never; Returns: undefined }
      send_team_message_once: {
        Args: { p_content: string; p_id: string; p_thread: string }
        Returns: string
      }
      set_inventory_flooring_row_value: {
        Args: {
          p_expected_version: number
          p_field: string
          p_inventory_item_id: string
          p_value: string
        }
        Returns: {
          background_color: string | null
          inventory_item_id: string
          org_id: string
          report_removed_at: string | null
          report_removed_by: string | null
          status_text: string | null
          updated_at: string
          updated_by: string | null
          version: number
        }
        SetofOptions: {
          from: "*"
          to: "inventory_flooring_rows"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_clock_in: {
        Args: {
          p_accuracy_m?: number
          p_ip?: string
          p_lat?: number
          p_lng?: number
        }
        Returns: {
          acknowledged_incomplete_count: number
          acknowledged_task_ids: string[]
          clock_in: string
          clock_in_accuracy_m: number | null
          clock_in_ip: string | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out: string | null
          clock_out_reason: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      staff_clock_out: {
        Args: { p_acknowledged_task_ids?: string[]; p_reason: string }
        Returns: {
          acknowledged_incomplete_count: number
          acknowledged_task_ids: string[]
          clock_in: string
          clock_in_accuracy_m: number | null
          clock_in_ip: string | null
          clock_in_lat: number | null
          clock_in_lng: number | null
          clock_out: string | null
          clock_out_reason: string | null
          created_at: string
          edited_at: string | null
          edited_by: string | null
          id: string
          org_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff_time_entries"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_summary_task: {
        Args: {
          p_expected_updated_at: string
          p_patch: Json
          p_task_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
