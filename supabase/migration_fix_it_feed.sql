-- SPAS 360 Fix-It Feed
-- SandPro-style proof-based closure workflow, scoped to the user's organization.
-- Apply via the Supabase SQL editor or `supabase db push`.

CREATE TABLE IF NOT EXISTS fix_it_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  body TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  claimed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  agent_tested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  agent_tested_at TIMESTAMPTZ,
  human_reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  human_reviewed_at TIMESTAMPTZ,
  archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  reopen_count INT NOT NULL DEFAULT 0,
  reopened_from_status TEXT,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'fixed', 'agent_done', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fix_it_posts
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS agent_tested_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS agent_tested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS human_reviewed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS human_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopened_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reopen_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reopened_from_status TEXT;

UPDATE fix_it_posts
SET org_id = COALESCE(org_id, (SELECT org_id FROM profiles WHERE profiles.id = fix_it_posts.created_by), (SELECT id FROM organizations LIMIT 1))
WHERE org_id IS NULL;

ALTER TABLE fix_it_posts ALTER COLUMN org_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE fix_it_posts
    ADD CONSTRAINT fix_it_posts_status_check
    CHECK (status IN ('open', 'in_progress', 'fixed', 'agent_done', 'archived'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE TABLE IF NOT EXISTS fix_it_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES fix_it_posts(id) ON DELETE CASCADE,
  body TEXT DEFAULT '',
  created_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fix_it_comments
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE fix_it_comments c
SET org_id = p.org_id
FROM fix_it_posts p
WHERE c.post_id = p.id
  AND c.org_id IS NULL;

ALTER TABLE fix_it_comments
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW();

CREATE TABLE IF NOT EXISTS fix_it_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES fix_it_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES fix_it_comments(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'report'
    CHECK (purpose IN ('report', 'comment', 'validation_proof')),
  type TEXT DEFAULT 'file',
  mime_type TEXT DEFAULT '',
  size TEXT DEFAULT '',
  storage_path TEXT,
  url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE fix_it_attachments
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS comment_id UUID REFERENCES fix_it_comments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'report';

UPDATE fix_it_attachments a
SET org_id = p.org_id
FROM fix_it_posts p
WHERE a.post_id = p.id
  AND a.org_id IS NULL;

ALTER TABLE fix_it_attachments ALTER COLUMN org_id SET NOT NULL;

DO $$
BEGIN
  ALTER TABLE fix_it_attachments
    ADD CONSTRAINT fix_it_attachments_purpose_check
    CHECK (purpose IN ('report', 'comment', 'validation_proof'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_fix_it_posts_org_created ON fix_it_posts(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fix_it_posts_org_status ON fix_it_posts(org_id, status);
CREATE INDEX IF NOT EXISTS idx_fix_it_comments_post ON fix_it_comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fix_it_attachments_post ON fix_it_attachments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fix_it_attachments_comment ON fix_it_attachments(comment_id);
CREATE INDEX IF NOT EXISTS idx_fix_it_attachments_purpose ON fix_it_attachments(purpose);

DROP TRIGGER IF EXISTS set_fix_it_posts_updated ON fix_it_posts;
CREATE TRIGGER set_fix_it_posts_updated
  BEFORE UPDATE ON fix_it_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS set_fix_it_comments_updated ON fix_it_comments;
CREATE TRIGGER set_fix_it_comments_updated
  BEFORE UPDATE ON fix_it_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE fix_it_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE fix_it_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE fix_it_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fix_it_posts_read ON fix_it_posts;
CREATE POLICY fix_it_posts_read ON fix_it_posts
  FOR SELECT TO authenticated
  USING (org_id = auth_org());

DROP POLICY IF EXISTS fix_it_posts_insert ON fix_it_posts;
CREATE POLICY fix_it_posts_insert ON fix_it_posts
  FOR INSERT TO authenticated
  WITH CHECK (org_id = auth_org() AND created_by = auth.uid());

DROP POLICY IF EXISTS fix_it_posts_update ON fix_it_posts;
CREATE POLICY fix_it_posts_update ON fix_it_posts
  FOR UPDATE TO authenticated
  USING (org_id = auth_org())
  WITH CHECK (org_id = auth_org());

DROP POLICY IF EXISTS fix_it_posts_delete ON fix_it_posts;
CREATE POLICY fix_it_posts_delete ON fix_it_posts
  FOR DELETE TO authenticated
  USING (org_id = auth_org() AND (created_by = auth.uid() OR claimed_by = auth.uid() OR is_manager()));

DROP POLICY IF EXISTS fix_it_comments_read ON fix_it_comments;
CREATE POLICY fix_it_comments_read ON fix_it_comments
  FOR SELECT TO authenticated
  USING (org_id = auth_org());

DROP POLICY IF EXISTS fix_it_comments_insert ON fix_it_comments;
CREATE POLICY fix_it_comments_insert ON fix_it_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = auth_org()
    AND created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM fix_it_posts p
      WHERE p.id = post_id
        AND p.org_id = auth_org()
    )
  );

DROP POLICY IF EXISTS fix_it_comments_update ON fix_it_comments;
CREATE POLICY fix_it_comments_update ON fix_it_comments
  FOR UPDATE TO authenticated
  USING (org_id = auth_org() AND (created_by = auth.uid() OR is_manager()))
  WITH CHECK (org_id = auth_org() AND (created_by = auth.uid() OR is_manager()));

DROP POLICY IF EXISTS fix_it_comments_delete ON fix_it_comments;
CREATE POLICY fix_it_comments_delete ON fix_it_comments
  FOR DELETE TO authenticated
  USING (org_id = auth_org() AND (created_by = auth.uid() OR is_manager()));

DROP POLICY IF EXISTS fix_it_attachments_read ON fix_it_attachments;
CREATE POLICY fix_it_attachments_read ON fix_it_attachments
  FOR SELECT TO authenticated
  USING (org_id = auth_org());

DROP POLICY IF EXISTS fix_it_attachments_insert ON fix_it_attachments;
CREATE POLICY fix_it_attachments_insert ON fix_it_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = auth_org()
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM fix_it_posts p
      WHERE p.id = post_id
        AND p.org_id = auth_org()
    )
  );

DROP POLICY IF EXISTS fix_it_attachments_delete ON fix_it_attachments;
CREATE POLICY fix_it_attachments_delete ON fix_it_attachments
  FOR DELETE TO authenticated
  USING (org_id = auth_org() AND (uploaded_by = auth.uid() OR is_manager()));

GRANT SELECT, INSERT, UPDATE, DELETE ON fix_it_posts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON fix_it_comments TO authenticated;
GRANT SELECT, INSERT, DELETE ON fix_it_attachments TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('fix-it-files', 'fix-it-files', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS fix_it_files_read ON storage.objects;
CREATE POLICY fix_it_files_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fix-it-files');

DROP POLICY IF EXISTS fix_it_files_upload ON storage.objects;
CREATE POLICY fix_it_files_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fix-it-files' AND owner = auth.uid());

DROP POLICY IF EXISTS fix_it_files_delete ON storage.objects;
CREATE POLICY fix_it_files_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'fix-it-files' AND (owner = auth.uid() OR public.is_manager()));

ALTER TABLE fix_it_posts REPLICA IDENTITY FULL;
ALTER TABLE fix_it_comments REPLICA IDENTITY FULL;
ALTER TABLE fix_it_attachments REPLICA IDENTITY FULL;

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['fix_it_posts', 'fix_it_comments', 'fix_it_attachments']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;
