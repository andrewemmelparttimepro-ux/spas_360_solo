-- Managers can remove inventory units (there was no DELETE policy at all — default deny).
-- Applied to project kxyqgkimcdxvfkceoixs 2026-07-05.
CREATE POLICY inv_delete ON inventory_items FOR DELETE USING (
  org_id = auth_org() AND auth_role() IN ('owner_manager', 'service_manager')
);
