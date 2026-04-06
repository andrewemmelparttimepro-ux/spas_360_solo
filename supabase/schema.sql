-- ============================================================
-- SPAS 360 — Complete Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For fuzzy text search

-- ─── Organizations ──────────────────────────────────────────
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Locations ──────────────────────────────────────────────
CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_locations_org ON locations(org_id);

-- ─── Profiles (synced with auth.users) ──────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  role TEXT NOT NULL DEFAULT 'salesperson'
    CHECK (role IN ('owner_manager', 'service_manager', 'salesperson', 'technician')),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_profiles_org ON profiles(org_id);

-- Auto-create profile on signup
-- Admin emails get owner_manager role; everyone else gets salesperson
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _role TEXT;
BEGIN
  -- Auto-promote known admin emails to owner_manager
  IF NEW.email IN (
    'andrewemmelparttimepro@gmail.com',
    'matt@spas360.com'
  ) THEN
    _role := 'owner_manager';
  ELSE
    _role := COALESCE(NEW.raw_user_meta_data->>'role', 'salesperson');
  END IF;

  INSERT INTO public.profiles (id, org_id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    (SELECT id FROM organizations LIMIT 1),
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'New'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
    _role
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── Contacts ───────────────────────────────────────────────
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID REFERENCES locations(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT NOT NULL,
  phone_secondary TEXT,
  mailing_address TEXT,
  lead_source TEXT NOT NULL DEFAULT 'Walk-in'
    CHECK (lead_source IN ('Walk-in', 'Website', 'Referral', 'Ad', 'Phone', 'Event', 'Other')),
  customer_type TEXT NOT NULL DEFAULT 'Lead'
    CHECK (customer_type IN ('Lead', 'Prospect', 'Customer', 'Past Customer')),
  assigned_to UUID REFERENCES profiles(id),
  tags TEXT[] DEFAULT '{}',
  qb_customer_id TEXT,
  last_activity_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_contacts_org ON contacts(org_id);
CREATE INDEX idx_contacts_assigned ON contacts(assigned_to);
CREATE INDEX idx_contacts_phone ON contacts(phone);
CREATE INDEX idx_contacts_search ON contacts USING gin (
  (first_name || ' ' || last_name) gin_trgm_ops
);

-- ─── Properties ─────────────────────────────────────────────
CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'Residential',
  notes TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_properties_contact ON properties(contact_id);

-- ─── Pipeline Stages ────────────────────────────────────────
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INT NOT NULL,
  probability DECIMAL(5,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_stages_org ON pipeline_stages(org_id);

-- ─── Deals ──────────────────────────────────────────────────
CREATE TABLE deals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES pipeline_stages(id),
  title TEXT NOT NULL,
  amount DECIMAL(12,2),
  priority TEXT NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('High', 'Medium', 'Low')),
  expected_close_date DATE,
  assigned_to UUID NOT NULL REFERENCES profiles(id),
  product_interest TEXT[] DEFAULT '{}',
  lead_source TEXT NOT NULL DEFAULT 'Walk-in'
    CHECK (lead_source IN ('Walk-in', 'Website', 'Referral', 'Ad', 'Phone', 'Event', 'Other')),
  lost_reason TEXT,
  location_id UUID REFERENCES locations(id),
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deals_org ON deals(org_id);
CREATE INDEX idx_deals_contact ON deals(contact_id);
CREATE INDEX idx_deals_stage ON deals(stage_id);
CREATE INDEX idx_deals_assigned ON deals(assigned_to);

-- ─── Jobs ───────────────────────────────────────────────────
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id),
  location_id UUID NOT NULL REFERENCES locations(id),
  title TEXT NOT NULL,
  job_type TEXT NOT NULL DEFAULT 'Repair'
    CHECK (job_type IN ('Delivery', 'Repair', 'Installation', 'Warranty', 'Maintenance', 'Pickup')),
  status TEXT NOT NULL DEFAULT 'In Progress'
    CHECK (status IN ('Delivery', 'Parts on Order', 'Warranty', 'Ready for Pickup', 'In Progress', 'Completed', 'Cancelled')),
  description TEXT,
  scheduled_at TIMESTAMPTZ,
  estimated_duration INT, -- minutes
  priority TEXT CHECK (priority IN ('High', 'Medium', 'Low')),
  amount_to_collect DECIMAL(12,2),
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_jobs_org ON jobs(org_id);
CREATE INDEX idx_jobs_contact ON jobs(contact_id);
CREATE INDEX idx_jobs_location ON jobs(location_id);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_scheduled ON jobs(scheduled_at);

-- ─── Job Assignments (many techs per job) ───────────────────
CREATE TABLE job_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(job_id, user_id)
);
CREATE INDEX idx_job_assignments_user ON job_assignments(user_id);

-- ─── Parts ──────────────────────────────────────────────────
CREATE TABLE parts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  part_number TEXT NOT NULL,
  description TEXT NOT NULL,
  manufacturer TEXT,
  status TEXT NOT NULL DEFAULT 'Not Ordered'
    CHECK (status IN ('Not Ordered', 'Ordered', 'Shipped', 'Backordered', 'Received')),
  order_date DATE,
  expected_arrival DATE,
  tracking_number TEXT,
  supplier TEXT,
  cost DECIMAL(10,2),
  received_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_parts_job ON parts(job_id);
CREATE INDEX idx_parts_status ON parts(status);

-- ─── Inventory Items ────────────────────────────────────────
CREATE TABLE inventory_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id),
  sku TEXT NOT NULL,
  product TEXT NOT NULL,
  brand TEXT,
  category TEXT NOT NULL,
  model TEXT,
  color_finish TEXT,
  status TEXT NOT NULL DEFAULT 'In Stock'
    CHECK (status IN ('On Order', 'In Stock', 'Sold', 'In Transit', 'Delivered', 'Returned')),
  cost DECIMAL(10,2),
  msrp DECIMAL(10,2),
  sale_price DECIMAL(10,2),
  customer_id UUID REFERENCES contacts(id),
  deal_id UUID REFERENCES deals(id),
  job_id UUID REFERENCES jobs(id),
  date_received DATE,
  date_sold DATE,
  date_delivered DATE,
  warranty_info TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_inventory_org ON inventory_items(org_id);
CREATE INDEX idx_inventory_location ON inventory_items(location_id);
CREATE INDEX idx_inventory_status ON inventory_items(status);
CREATE INDEX idx_inventory_sku ON inventory_items(sku);

-- ─── Communication Threads ──────────────────────────────────
CREATE TABLE communication_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  thread_type TEXT NOT NULL DEFAULT 'sms' CHECK (thread_type IN ('sms', 'email')),
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_threads_org ON communication_threads(org_id);
CREATE INDEX idx_threads_contact ON communication_threads(contact_id);

-- ─── Messages ───────────────────────────────────────────────
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES communication_threads(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('system', 'customer', 'agent')),
  sender_id UUID REFERENCES profiles(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_messages_thread ON messages(thread_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- ─── Tasks ──────────────────────────────────────────────────
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  assigned_to UUID NOT NULL REFERENCES profiles(id),
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ NOT NULL,
  priority TEXT NOT NULL DEFAULT 'Medium'
    CHECK (priority IN ('High', 'Medium', 'Low')),
  status TEXT NOT NULL DEFAULT 'Pending'
    CHECK (status IN ('Pending', 'In Progress', 'Completed', 'Overdue')),
  task_type TEXT,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tasks_assigned ON tasks(assigned_to);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_at);

-- ─── Notes ──────────────────────────────────────────────────
CREATE TABLE notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deals(id) ON DELETE CASCADE,
  job_id UUID REFERENCES jobs(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notes_contact ON notes(contact_id);
CREATE INDEX idx_notes_deal ON notes(deal_id);
CREATE INDEX idx_notes_job ON notes(job_id);

-- ─── Time Entries ───────────────────────────────────────────
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  break_minutes INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_time_entries_job ON time_entries(job_id);
CREATE INDEX idx_time_entries_user ON time_entries(user_id);

-- ─── Notifications ──────────────────────────────────────────
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  link TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);

-- ─── Audit Log ──────────────────────────────────────────────
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data JSONB,
  new_data JSONB,
  user_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_table ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_user ON audit_log(user_id);

-- ─── Agent/Team Threads ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  thread_type TEXT NOT NULL DEFAULT 'agent' CHECK (thread_type IN ('agent', 'team')),
  title TEXT,
  participants UUID[] DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_threads_user ON agent_threads(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_threads_org ON agent_threads(org_id);

-- ─── Agent/Team Messages ────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_name TEXT,
  sender_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_thread ON agent_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(created_at);

-- ─── Updated_at trigger ─────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_contacts_updated BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_deals_updated BEFORE UPDATE ON deals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_jobs_updated BEFORE UPDATE ON jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_parts_updated BEFORE UPDATE ON parts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_inventory_updated BEFORE UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER set_tasks_updated BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: get current user's org_id
CREATE OR REPLACE FUNCTION auth_org()
RETURNS UUID AS $$
  SELECT org_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Helper: check if user is manager
CREATE OR REPLACE FUNCTION is_manager()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid() AND role IN ('owner_manager', 'service_manager')
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Organizations: members can read their own org
CREATE POLICY org_read ON organizations FOR SELECT USING (
  id = auth_org()
);

-- Locations: members can read all locations in their org
CREATE POLICY loc_read ON locations FOR SELECT USING (org_id = auth_org());
CREATE POLICY loc_manage ON locations FOR ALL USING (
  org_id = auth_org() AND auth_role() = 'owner_manager'
);

-- Profiles: read all in org, update own
CREATE POLICY profile_read ON profiles FOR SELECT USING (org_id = auth_org());
CREATE POLICY profile_update_self ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY profile_manage ON profiles FOR ALL USING (
  org_id = auth_org() AND auth_role() = 'owner_manager'
);

-- Contacts: all roles can read within org, salespeople+ can create/update
CREATE POLICY contact_read ON contacts FOR SELECT USING (org_id = auth_org());
CREATE POLICY contact_insert ON contacts FOR INSERT WITH CHECK (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'service_manager', 'salesperson')
);
CREATE POLICY contact_update ON contacts FOR UPDATE USING (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'service_manager', 'salesperson')
);
CREATE POLICY contact_delete ON contacts FOR DELETE USING (
  org_id = auth_org() AND auth_role() = 'owner_manager'
);

-- Properties: access via contact
CREATE POLICY property_read ON properties FOR SELECT USING (
  EXISTS (SELECT 1 FROM contacts WHERE contacts.id = properties.contact_id AND contacts.org_id = auth_org())
);
CREATE POLICY property_manage ON properties FOR ALL USING (
  EXISTS (SELECT 1 FROM contacts WHERE contacts.id = properties.contact_id AND contacts.org_id = auth_org())
  AND auth_role() IN ('owner_manager', 'service_manager', 'salesperson')
);

-- Pipeline stages: org-wide read, admin manage
CREATE POLICY stage_read ON pipeline_stages FOR SELECT USING (org_id = auth_org());
CREATE POLICY stage_manage ON pipeline_stages FOR ALL USING (
  org_id = auth_org() AND auth_role() = 'owner_manager'
);

-- Deals: salespeople see own + team view, managers see all
CREATE POLICY deal_read ON deals FOR SELECT USING (org_id = auth_org());
CREATE POLICY deal_insert ON deals FOR INSERT WITH CHECK (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'salesperson')
);
CREATE POLICY deal_update ON deals FOR UPDATE USING (
  org_id = auth_org() AND (assigned_to = auth.uid() OR is_manager())
);
CREATE POLICY deal_delete ON deals FOR DELETE USING (
  org_id = auth_org() AND auth_role() = 'owner_manager'
);

-- Jobs: service roles + managers
CREATE POLICY job_read ON jobs FOR SELECT USING (org_id = auth_org());
CREATE POLICY job_insert ON jobs FOR INSERT WITH CHECK (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'service_manager', 'salesperson')
);
CREATE POLICY job_update ON jobs FOR UPDATE USING (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'service_manager')
);

-- Job assignments
CREATE POLICY ja_read ON job_assignments FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_assignments.job_id AND jobs.org_id = auth_org())
);
CREATE POLICY ja_manage ON job_assignments FOR ALL USING (
  EXISTS (SELECT 1 FROM jobs WHERE jobs.id = job_assignments.job_id AND jobs.org_id = auth_org())
  AND auth_role() IN ('owner_manager', 'service_manager')
);

-- Parts: access via job
CREATE POLICY parts_read ON parts FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs WHERE jobs.id = parts.job_id AND jobs.org_id = auth_org())
);
CREATE POLICY parts_manage ON parts FOR ALL USING (
  EXISTS (SELECT 1 FROM jobs WHERE jobs.id = parts.job_id AND jobs.org_id = auth_org())
  AND auth_role() IN ('owner_manager', 'service_manager')
);

-- Inventory: org-wide read, manage by role
CREATE POLICY inv_read ON inventory_items FOR SELECT USING (org_id = auth_org());
CREATE POLICY inv_insert ON inventory_items FOR INSERT WITH CHECK (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'service_manager', 'salesperson')
);
CREATE POLICY inv_update ON inventory_items FOR UPDATE USING (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'service_manager', 'salesperson')
);

-- Communication: agent + manager see all in org
CREATE POLICY thread_read ON communication_threads FOR SELECT USING (org_id = auth_org());
CREATE POLICY thread_manage ON communication_threads FOR ALL USING (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'service_manager', 'salesperson')
);

CREATE POLICY msg_read ON messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM communication_threads t WHERE t.id = messages.thread_id AND t.org_id = auth_org())
);
CREATE POLICY msg_insert ON messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM communication_threads t WHERE t.id = messages.thread_id AND t.org_id = auth_org())
);

-- Tasks: own + manager view
CREATE POLICY task_read ON tasks FOR SELECT USING (
  org_id = auth_org() AND (assigned_to = auth.uid() OR is_manager())
);
CREATE POLICY task_insert ON tasks FOR INSERT WITH CHECK (org_id = auth_org());
CREATE POLICY task_update ON tasks FOR UPDATE USING (
  org_id = auth_org() AND (assigned_to = auth.uid() OR is_manager())
);

-- Notes: org-wide
CREATE POLICY note_read ON notes FOR SELECT USING (
  (contact_id IS NOT NULL AND EXISTS (SELECT 1 FROM contacts c WHERE c.id = notes.contact_id AND c.org_id = auth_org()))
  OR (deal_id IS NOT NULL AND EXISTS (SELECT 1 FROM deals d WHERE d.id = notes.deal_id AND d.org_id = auth_org()))
  OR (job_id IS NOT NULL AND EXISTS (SELECT 1 FROM jobs j WHERE j.id = notes.job_id AND j.org_id = auth_org()))
);
CREATE POLICY note_insert ON notes FOR INSERT WITH CHECK (
  auth_role() IN ('owner_manager', 'service_manager', 'salesperson')
);

-- Time entries: own + manager
CREATE POLICY te_read ON time_entries FOR SELECT USING (
  user_id = auth.uid() OR is_manager()
);
CREATE POLICY te_insert ON time_entries FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY te_update ON time_entries FOR UPDATE USING (
  user_id = auth.uid() OR is_manager()
);

-- Notifications: own only
CREATE POLICY notif_read ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY notif_update ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY notif_insert ON notifications FOR INSERT WITH CHECK (TRUE);

-- Audit log: admin only
CREATE POLICY audit_read ON audit_log FOR SELECT USING (auth_role() = 'owner_manager');
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (TRUE);

-- Agent threads + messages RLS
ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY at_read ON agent_threads FOR SELECT USING (
  user_id = auth.uid()
  OR (thread_type = 'team' AND auth.uid() = ANY(participants))
  OR (org_id = auth_org() AND thread_type = 'team')
);
CREATE POLICY at_insert ON agent_threads FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY at_update ON agent_threads FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY am_read ON agent_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM agent_threads t WHERE t.id = agent_messages.thread_id
    AND (t.user_id = auth.uid() OR auth.uid() = ANY(t.participants) OR t.thread_type = 'team'))
);
CREATE POLICY am_insert ON agent_messages FOR INSERT WITH CHECK (TRUE);

-- ═══════════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════════

-- Organization
INSERT INTO organizations (id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Spas 360');

-- Locations
INSERT INTO locations (id, org_id, name, address, phone) VALUES
  ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'Minot', '123 Main St, Minot, ND 58701', '(701) 555-0100'),
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'Bismarck', '456 Capital Ave, Bismarck, ND 58501', '(701) 555-0200');

-- Pipeline stages (11 from spec §4.1.1)
INSERT INTO pipeline_stages (id, org_id, name, position, probability) VALUES
  ('00000000-0000-0000-0000-000000000100', '00000000-0000-0000-0000-000000000001', 'No Contact Made', 1, 5),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Contact Attempted', 2, 10),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Contact Made', 3, 20),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Showroom Visit Scheduled', 4, 30),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Showroom Visit Complete', 5, 40),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'Estimate Sent', 6, 50),
  ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000001', 'In Discussion', 7, 60),
  ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000001', 'Verbal Commitment', 8, 80),
  ('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000001', 'Deposit Received', 9, 90),
  ('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000001', 'Closed - Won', 10, 100),
  ('00000000-0000-0000-0000-00000000010a', '00000000-0000-0000-0000-000000000001', 'Closed - Lost', 11, 0);