-- Keep each authorized business account and its existing run references.
alter table public.migration_connections
  drop constraint migration_connections_org_id_provider_key,
  add constraint migration_connections_org_provider_account_key
    unique (org_id, provider, external_account_id);
