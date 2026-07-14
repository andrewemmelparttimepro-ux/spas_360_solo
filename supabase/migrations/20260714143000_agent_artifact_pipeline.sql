-- Ari artifact pipeline: durable, private files that remain available on every client.

alter table public.agent_deliverables
  add column if not exists status text not null default 'ready',
  add column if not exists artifact_format text,
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_name text,
  add column if not exists file_size_bytes bigint,
  add column if not exists source_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists missing_fields jsonb not null default '[]'::jsonb,
  add column if not exists version integer not null default 1,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_deliverables_status_check'
      and conrelid = 'public.agent_deliverables'::regclass
  ) then
    alter table public.agent_deliverables
      add constraint agent_deliverables_status_check
      check (status in ('draft', 'blocked', 'rendering', 'ready', 'failed'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'agent_deliverables_artifact_format_check'
      and conrelid = 'public.agent_deliverables'::regclass
  ) then
    alter table public.agent_deliverables
      add constraint agent_deliverables_artifact_format_check
      check (artifact_format is null or artifact_format in ('pdf', 'jpg', 'png'));
  end if;
end $$;

alter table public.agent_messages
  add column if not exists deliverable_id uuid references public.agent_deliverables(id) on delete set null;

create index if not exists idx_agent_messages_deliverable
  on public.agent_messages(deliverable_id)
  where deliverable_id is not null;

create index if not exists idx_agent_deliverables_org_status_created
  on public.agent_deliverables(org_id, status, created_at desc);

alter table public.business_profile
  add column if not exists logo_storage_path text;

alter table public.inventory_items
  add column if not exists primary_image_storage_path text,
  add column if not exists primary_image_mime_type text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ari-deliverables',
  'ari-deliverables',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ari-assets',
  'ari-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ari_deliverables_read on storage.objects;
create policy ari_deliverables_read on storage.objects
for select to authenticated
using (
  bucket_id = 'ari-deliverables'
  and (storage.foldername(name))[1] = auth_org()::text
);

drop policy if exists ari_assets_read on storage.objects;
create policy ari_assets_read on storage.objects
for select to authenticated
using (
  bucket_id = 'ari-assets'
  and (storage.foldername(name))[1] = auth_org()::text
);

drop policy if exists ari_assets_insert on storage.objects;
create policy ari_assets_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ari-assets'
  and (storage.foldername(name))[1] = auth_org()::text
  and auth_role() = any(array['owner_manager', 'service_manager', 'salesperson'])
);

drop policy if exists ari_assets_update on storage.objects;
create policy ari_assets_update on storage.objects
for update to authenticated
using (
  bucket_id = 'ari-assets'
  and (storage.foldername(name))[1] = auth_org()::text
  and auth_role() = any(array['owner_manager', 'service_manager'])
)
with check (
  bucket_id = 'ari-assets'
  and (storage.foldername(name))[1] = auth_org()::text
  and auth_role() = any(array['owner_manager', 'service_manager'])
);

drop policy if exists ari_assets_delete on storage.objects;
create policy ari_assets_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'ari-assets'
  and (storage.foldername(name))[1] = auth_org()::text
  and auth_role() = any(array['owner_manager', 'service_manager'])
);

comment on column public.agent_deliverables.storage_path is
  'Private Storage object path. API issues short-lived signed URLs after RLS authorization.';
comment on column public.agent_deliverables.missing_fields is
  'Structured preflight blockers; ready artifacts always use an empty array.';
