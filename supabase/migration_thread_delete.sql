-- Users can delete their own agent conversations (messages cascade via FK).
-- Applied to project kxyqgkimcdxvfkceoixs 2026-07-06.
CREATE POLICY at_delete ON agent_threads FOR DELETE USING (user_id = auth.uid());
