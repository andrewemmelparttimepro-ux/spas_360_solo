-- Applied 2026-07-09 via MCP (migration: invite_only_signups).
-- Signups become invite-only. Managers whitelist an email (+ role) in
-- app_invites; handle_new_user rejects anyone else. Also closes the hole
-- where raw_user_meta_data->>'role' let a signup pick its own role.

CREATE TABLE IF NOT EXISTS app_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'salesperson'
    CHECK (role IN ('owner_manager','service_manager','salesperson','technician')),
  invited_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS app_invites_open_email
  ON app_invites (lower(email)) WHERE claimed_at IS NULL;

ALTER TABLE app_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY invites_select ON app_invites FOR SELECT
  USING (org_id = auth_org() AND auth_role() = 'owner_manager');
CREATE POLICY invites_insert ON app_invites FOR INSERT
  WITH CHECK (org_id = auth_org() AND auth_role() = 'owner_manager');
CREATE POLICY invites_delete ON app_invites FOR DELETE
  USING (org_id = auth_org() AND auth_role() = 'owner_manager');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  target_org UUID;
  user_count INT;
  assigned_role TEXT;
  invite RECORD;
BEGIN
  SELECT id INTO target_org FROM organizations LIMIT 1;
  SELECT COUNT(*) INTO user_count FROM profiles WHERE org_id = target_org;

  IF user_count = 0 THEN
    assigned_role := 'owner_manager';
  ELSE
    SELECT * INTO invite FROM app_invites
      WHERE lower(email) = lower(COALESCE(NEW.email, ''))
        AND claimed_at IS NULL
      LIMIT 1;
    IF invite IS NULL THEN
      RAISE EXCEPTION 'SIGNUPS_INVITE_ONLY';
    END IF;
    assigned_role := invite.role;
    UPDATE app_invites SET claimed_at = now() WHERE id = invite.id;
  END IF;

  INSERT INTO public.profiles (id, org_id, email, first_name, last_name, role)
  VALUES (
    NEW.id,
    target_org,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'first_name', 'New'),
    COALESCE(NEW.raw_user_meta_data->>'last_name', 'User'),
    assigned_role
  );
  RETURN NEW;
END;
$function$;
