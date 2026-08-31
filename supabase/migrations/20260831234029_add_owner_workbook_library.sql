-- Owner-only, tenant-scoped workbook library. Workbook bytes stay in a private
-- Storage bucket; this table is the authoritative index used by Owners Corner.

create table public.owner_workbooks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  folder_key text not null,
  display_name text not null,
  storage_path text not null unique,
  mime_type text not null default 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  file_size_bytes bigint not null,
  source_sha256 text not null,
  current_sha256 text not null,
  version integer not null default 1,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_workbooks_folder_key_check
    check (folder_key in ('inventory-profits', 'mchl-major-unit-sales')),
  constraint owner_workbooks_display_name_check
    check (char_length(btrim(display_name)) between 6 and 200 and lower(display_name) like '%.xlsx'),
  constraint owner_workbooks_storage_path_check
    check (storage_path like org_id::text || '/%'),
  constraint owner_workbooks_mime_type_check
    check (mime_type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  constraint owner_workbooks_file_size_check
    check (file_size_bytes between 1 and 20971520),
  constraint owner_workbooks_source_sha_check
    check (source_sha256 ~ '^[0-9a-f]{64}$'),
  constraint owner_workbooks_current_sha_check
    check (current_sha256 ~ '^[0-9a-f]{64}$'),
  constraint owner_workbooks_version_check check (version > 0),
  constraint owner_workbooks_org_folder_name_key unique (org_id, folder_key, display_name)
);

create index owner_workbooks_org_folder_updated_idx
  on public.owner_workbooks (org_id, folder_key, updated_at desc, id);

create trigger owner_workbooks_set_updated_at
  before update on public.owner_workbooks
  for each row execute function public.update_updated_at();

alter table public.owner_workbooks enable row level security;

create policy owner_workbooks_select on public.owner_workbooks
  for select to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
  );

create policy owner_workbooks_insert on public.owner_workbooks
  for insert to authenticated
  with check (
    org_id = (select public.auth_org())
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
    and storage_path like org_id::text || '/%'
    and (select public.auth_role()) = 'owner_manager'
  );

create policy owner_workbooks_update on public.owner_workbooks
  for update to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
  )
  with check (
    org_id = (select public.auth_org())
    and updated_by = (select auth.uid())
    and storage_path like org_id::text || '/%'
    and (select public.auth_role()) = 'owner_manager'
  );

revoke all on table public.owner_workbooks from anon, authenticated;
grant select on table public.owner_workbooks to authenticated;
grant insert (
  org_id, folder_key, display_name, storage_path, mime_type,
  file_size_bytes, source_sha256, current_sha256, created_by, updated_by
) on table public.owner_workbooks to authenticated;
grant update (file_size_bytes, current_sha256, version, updated_by)
  on table public.owner_workbooks to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'owner-workbooks',
  'owner-workbooks',
  false,
  20971520,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists owner_workbooks_storage_select on storage.objects;
create policy owner_workbooks_storage_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'owner-workbooks'
    and (storage.foldername(name))[1] = (select public.auth_org())::text
    and (select public.auth_role()) = 'owner_manager'
  );

drop policy if exists owner_workbooks_storage_insert on storage.objects;
create policy owner_workbooks_storage_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'owner-workbooks'
    and (storage.foldername(name))[1] = (select public.auth_org())::text
    and (select public.auth_role()) = 'owner_manager'
  );

drop policy if exists owner_workbooks_storage_update on storage.objects;
create policy owner_workbooks_storage_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'owner-workbooks'
    and (storage.foldername(name))[1] = (select public.auth_org())::text
    and (select public.auth_role()) = 'owner_manager'
  )
  with check (
    bucket_id = 'owner-workbooks'
    and (storage.foldername(name))[1] = (select public.auth_org())::text
    and (select public.auth_role()) = 'owner_manager'
  );

drop policy if exists owner_workbooks_storage_delete on storage.objects;
create policy owner_workbooks_storage_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'owner-workbooks'
    and (storage.foldername(name))[1] = (select public.auth_org())::text
    and (select public.auth_role()) = 'owner_manager'
  );

comment on table public.owner_workbooks is
  'Owner-only workbook metadata; XLSX bytes are stored privately in owner-workbooks.';
comment on column public.owner_workbooks.source_sha256 is
  'SHA-256 of the exact workbook bytes at first authenticated import.';
comment on column public.owner_workbooks.current_sha256 is
  'SHA-256 of the latest autosaved workbook bytes.';
