-- ============================================================
-- SPAS 360 — Agent & Team Chat Tables
-- Run in Supabase SQL Editor after the main schema
-- ============================================================

-- ─── Agent/Team Threads ─────────────────────────────────────
CREATE TABLE agent_threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  thread_type TEXT NOT NULL DEFAULT 'agent' CHECK (thread_type IN ('agent', 'team')),
  title TEXT,
  participants UUID[] DEFAULT '{}',
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_threads_user ON agent_threads(user_id);
CREATE INDEX idx_agent_threads_org ON agent_threads(org_id);

-- ─── Agent/Team Messages ────────────────────────────────────
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_name TEXT,
  sender_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_agent_messages_thread ON agent_messages(thread_id);
CREATE INDEX idx_agent_messages_created ON agent_messages(created_at);

-- ─── RLS ────────────────────────────────────────────────────
ALTER TABLE agent_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

-- Threads: users see their own + team threads they're in
CREATE POLICY at_read ON agent_threads FOR SELECT USING (
  user_id = auth.uid() 
  OR (thread_type = 'team' AND auth.uid() = ANY(participants))
  OR (org_id = (SELECT org_id FROM profiles WHERE id = auth.uid()) AND thread_type = 'team')
);
CREATE POLICY at_insert ON agent_threads FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY at_update ON agent_threads FOR UPDATE USING (user_id = auth.uid());

-- Messages: can read messages from threads they can see
CREATE POLICY am_read ON agent_messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM agent_threads t WHERE t.id = agent_messages.thread_id 
    AND (t.user_id = auth.uid() OR auth.uid() = ANY(t.participants) OR t.thread_type = 'team'))
);
CREATE POLICY am_insert ON agent_messages FOR INSERT WITH CHECK (TRUE);
