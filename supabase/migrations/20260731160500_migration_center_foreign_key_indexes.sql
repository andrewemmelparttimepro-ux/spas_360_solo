-- Cover every Migration Center foreign key used by cascade/delete checks and
-- tenant/provider lookups. Existing composite indexes already cover the other
-- migration foreign keys.

create index migration_changes_org_idx
  on public.migration_changes(org_id);
create index migration_changes_source_record_idx
  on public.migration_changes(source_record_id);

create index migration_connections_connected_by_idx
  on public.migration_connections(connected_by);

create index migration_events_actor_idx
  on public.migration_events(actor_id);
create index migration_events_connection_idx
  on public.migration_events(connection_id);
create index migration_events_org_idx
  on public.migration_events(org_id);

create index migration_external_links_first_run_idx
  on public.migration_external_links(first_run_id);
create index migration_external_links_last_run_idx
  on public.migration_external_links(last_run_id);

create index migration_oauth_states_org_idx
  on public.migration_oauth_states(org_id);
create index migration_oauth_states_user_idx
  on public.migration_oauth_states(user_id);

create index migration_runs_connection_idx
  on public.migration_runs(connection_id);
create index migration_runs_source_run_idx
  on public.migration_runs(source_run_id);
create index migration_runs_started_by_idx
  on public.migration_runs(started_by);

create index migration_source_records_connection_idx
  on public.migration_source_records(connection_id);
create index migration_source_records_org_idx
  on public.migration_source_records(org_id);
