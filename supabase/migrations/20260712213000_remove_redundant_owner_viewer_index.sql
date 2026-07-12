-- user_id is already the primary key and leads every allowlist lookup.
drop index if exists public.idx_owner_activity_viewers_org;
