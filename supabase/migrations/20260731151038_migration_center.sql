-- SPAS 360 Migration Center
-- Server-only migration state. No table below is granted to browser roles;
-- the authenticated owner UI talks to the Vercel API, which re-verifies the
-- Supabase session and owner_manager role before using the service role.

create table public.migration_connections (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('hubspot', 'jobber')),
  status text not null default 'connected'
    check (status in ('connected', 'needs_reauth', 'disconnected', 'error')),
  external_account_id text,
  external_account_name text,
  scopes text[] not null default '{}',
  credentials_ciphertext text not null,
  token_expires_at timestamptz,
  connected_by uuid not null references public.profiles(id),
  connected_at timestamptz not null default now(),
  last_scan_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider)
);

create table public.migration_oauth_states (
  state_hash text primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (provider in ('hubspot', 'jobber')),
  verifier_ciphertext text,
  return_to text not null default '/settings',
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.migration_runs (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid references public.migration_connections(id) on delete set null,
  source_run_id uuid references public.migration_runs(id) on delete set null,
  run_type text not null check (run_type in ('scan', 'import', 'rollback')),
  provider text not null check (provider in ('hubspot', 'jobber')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'awaiting_review', 'completed', 'failed', 'cancelled')),
  phase text not null default 'queued',
  progress integer not null default 0 check (progress between 0 and 100),
  cursor jsonb not null default '{}'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  error text,
  started_by uuid not null references public.profiles(id),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.migration_source_records (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.migration_connections(id) on delete cascade,
  run_id uuid not null references public.migration_runs(id) on delete cascade,
  provider text not null check (provider in ('hubspot', 'jobber')),
  object_type text not null,
  source_id text not null,
  source_updated_at timestamptz,
  raw jsonb not null,
  normalized jsonb not null default '{}'::jsonb,
  checksum text not null,
  disposition text not null default 'staged'
    check (disposition in ('staged', 'ready', 'needs_review', 'preserved', 'imported', 'skipped', 'failed')),
  issues jsonb not null default '[]'::jsonb,
  destination_table text,
  destination_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, object_type, source_id)
);

create table public.migration_external_links (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('hubspot', 'jobber')),
  object_type text not null,
  source_id text not null,
  destination_table text not null,
  destination_id uuid not null,
  first_run_id uuid references public.migration_runs(id) on delete set null,
  last_run_id uuid references public.migration_runs(id) on delete set null,
  last_source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, provider, object_type, source_id)
);

create table public.migration_changes (
  id uuid primary key default uuid_generate_v4(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null references public.migration_runs(id) on delete cascade,
  source_record_id uuid references public.migration_source_records(id) on delete set null,
  destination_table text not null,
  destination_id uuid not null,
  operation text not null check (operation in ('insert', 'update')),
  before_data jsonb,
  after_data jsonb not null,
  rolled_back_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.migration_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid references public.migration_runs(id) on delete cascade,
  connection_id uuid references public.migration_connections(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index migration_connections_org_idx on public.migration_connections(org_id);
create index migration_runs_org_created_idx on public.migration_runs(org_id, created_at desc);
create index migration_runs_status_idx on public.migration_runs(status, updated_at);
create index migration_source_records_run_idx on public.migration_source_records(run_id, object_type);
create index migration_source_records_destination_idx on public.migration_source_records(destination_table, destination_id);
create index migration_external_links_destination_idx on public.migration_external_links(destination_table, destination_id);
create index migration_changes_run_idx on public.migration_changes(run_id, created_at desc);
create index migration_events_run_idx on public.migration_events(run_id, created_at);
create index migration_oauth_states_expires_idx on public.migration_oauth_states(expires_at);

create trigger migration_connections_updated_at
before update on public.migration_connections
for each row execute function public.update_updated_at();

create trigger migration_runs_updated_at
before update on public.migration_runs
for each row execute function public.update_updated_at();

create trigger migration_source_records_updated_at
before update on public.migration_source_records
for each row execute function public.update_updated_at();

create trigger migration_external_links_updated_at
before update on public.migration_external_links
for each row execute function public.update_updated_at();

alter table public.migration_connections enable row level security;
alter table public.migration_oauth_states enable row level security;
alter table public.migration_runs enable row level security;
alter table public.migration_source_records enable row level security;
alter table public.migration_external_links enable row level security;
alter table public.migration_changes enable row level security;
alter table public.migration_events enable row level security;

revoke all on table public.migration_connections from anon, authenticated;
revoke all on table public.migration_oauth_states from anon, authenticated;
revoke all on table public.migration_runs from anon, authenticated;
revoke all on table public.migration_source_records from anon, authenticated;
revoke all on table public.migration_external_links from anon, authenticated;
revoke all on table public.migration_changes from anon, authenticated;
revoke all on table public.migration_events from anon, authenticated;
revoke all on sequence public.migration_events_id_seq from anon, authenticated;

grant all on table public.migration_connections to service_role;
grant all on table public.migration_oauth_states to service_role;
grant all on table public.migration_runs to service_role;
grant all on table public.migration_source_records to service_role;
grant all on table public.migration_external_links to service_role;
grant all on table public.migration_changes to service_role;
grant all on table public.migration_events to service_role;
grant usage, select on sequence public.migration_events_id_seq to service_role;

comment on table public.migration_connections is 'Server-only OAuth connections; credentials are AES-256-GCM encrypted before storage.';
comment on table public.migration_source_records is 'Immutable source snapshots used for preview, reconciliation, and repeatable imports.';
