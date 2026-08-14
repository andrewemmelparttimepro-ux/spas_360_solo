-- Companion migration for the NDAI Brain receiving project.
-- The credential row is inserted during deployment using only a SHA-256 hash;
-- the plaintext credential lives exclusively in the SPAS 360 Vault.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.ingest_credentials (
  id uuid primary key default gen_random_uuid(),
  label text not null unique,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz
);

revoke all on table private.ingest_credentials from public, anon, authenticated;

create or replace function public.verify_brain_ingest_token(p_token_hash text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, private
as $$
  select exists (
    select 1
    from private.ingest_credentials
    where token_hash = p_token_hash
      and active
  );
$$;

revoke all on function public.verify_brain_ingest_token(text) from public, anon, authenticated;
grant execute on function public.verify_brain_ingest_token(text) to service_role;

alter table public.agent_events
  add column if not exists source_system text,
  add column if not exists source_id text;

create unique index if not exists agent_events_source_identity_idx
  on public.agent_events (source_system, source_id);

alter table public.deliverables
  add column if not exists source_system text,
  add column if not exists source_id text;

create unique index if not exists deliverables_source_identity_idx
  on public.deliverables (source_system, source_id);
