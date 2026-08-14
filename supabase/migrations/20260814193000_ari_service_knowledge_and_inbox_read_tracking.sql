-- Ari service knowledge: governed private sources, page-level provenance,
-- exact part-number retrieval, public/staff separation, and real inbox reads.

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_doc_type_check;

alter table public.knowledge_documents
  add constraint knowledge_documents_doc_type_check check (doc_type = any (array[
    'voice', 'company', 'playbook', 'warranty', 'battlecard', 'promo',
    'policy', 'financing', 'reference', 'parts_catalog', 'service_manual',
    'owner_manual', 'technical_bulletin'
  ]));

alter table public.knowledge_documents
  add column if not exists source_key text,
  add column if not exists source_kind text not null default 'internal',
  add column if not exists manufacturer text,
  add column if not exists model_year_start integer,
  add column if not exists model_year_end integer,
  add column if not exists revision text,
  add column if not exists access_scope text not null default 'staff',
  add column if not exists storage_bucket text,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists source_sha256 text,
  add column if not exists citation_label text,
  add column if not exists verified_at timestamptz,
  add column if not exists review_due_at date,
  add column if not exists supersedes_document_id uuid references public.knowledge_documents(id) on delete set null,
  add column if not exists confidentiality_note text;

alter table public.knowledge_documents
  drop constraint if exists knowledge_documents_source_kind_check,
  add constraint knowledge_documents_source_kind_check
    check (source_kind in ('manufacturer', 'dealer', 'internal', 'regulatory')),
  drop constraint if exists knowledge_documents_access_scope_check,
  add constraint knowledge_documents_access_scope_check
    check (access_scope in ('staff', 'public')),
  drop constraint if exists knowledge_documents_model_years_check,
  add constraint knowledge_documents_model_years_check
    check (model_year_start is null or model_year_end is null or model_year_start <= model_year_end),
  drop constraint if exists knowledge_documents_source_sha256_check,
  add constraint knowledge_documents_source_sha256_check
    check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$');

create unique index if not exists knowledge_documents_org_source_key_uidx
  on public.knowledge_documents(org_id, source_key)
  where source_key is not null;
create index if not exists knowledge_documents_active_scope_idx
  on public.knowledge_documents(org_id, access_scope, doc_type, status)
  where status = 'active';
create index if not exists knowledge_documents_supersedes_idx
  on public.knowledge_documents(supersedes_document_id)
  where supersedes_document_id is not null;

alter table public.knowledge_chunks
  add column if not exists page_start integer,
  add column if not exists page_end integer,
  add column if not exists section_path text[] not null default '{}',
  add column if not exists part_numbers text[] not null default '{}',
  add column if not exists models text[] not null default '{}',
  add column if not exists content_sha256 text,
  add column if not exists char_count integer generated always as (char_length(content)) stored;

alter table public.knowledge_chunks
  drop constraint if exists knowledge_chunks_page_range_check,
  add constraint knowledge_chunks_page_range_check check (
    (page_start is null and page_end is null)
    or (page_start is not null and page_start > 0 and coalesce(page_end, page_start) >= page_start)
  ),
  drop constraint if exists knowledge_chunks_content_sha256_check,
  add constraint knowledge_chunks_content_sha256_check
    check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}$');

create unique index if not exists knowledge_chunks_document_index_uidx
  on public.knowledge_chunks(document_id, chunk_index);
create index if not exists knowledge_chunks_part_numbers_gin
  on public.knowledge_chunks using gin(part_numbers);
create index if not exists knowledge_chunks_models_gin
  on public.knowledge_chunks using gin(models);
create index if not exists knowledge_chunks_org_document_idx
  on public.knowledge_chunks(org_id, document_id);

-- High-confidence fitment rows sit beside full-text retrieval. They are
-- deliberately provenance-bound: a year/make/model answer can be definitive
-- only when its exact application was verified against a source page.
create table if not exists public.knowledge_part_applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  manufacturer text not null,
  model text not null,
  model_year_start integer,
  model_year_end integer,
  component text not null,
  part_number text not null,
  quantity integer,
  variant text,
  source_document_id uuid not null references public.knowledge_documents(id) on delete cascade,
  page_start integer,
  page_end integer,
  verification_note text,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (model_year_start is null or model_year_end is null or model_year_start <= model_year_end),
  check (quantity is null or quantity > 0),
  check (page_start is null or page_start > 0),
  check (page_end is null or (page_start is not null and page_end >= page_start))
);
create unique index if not exists knowledge_part_applications_fitment_uidx
  on public.knowledge_part_applications(
    org_id, manufacturer, model, model_year_start, model_year_end,
    component, part_number, source_document_id
  ) nulls not distinct;
create index if not exists knowledge_part_applications_lookup_idx
  on public.knowledge_part_applications(org_id, lower(manufacturer), lower(model), model_year_start, model_year_end);
create index if not exists knowledge_part_applications_source_idx
  on public.knowledge_part_applications(source_document_id);
alter table public.knowledge_part_applications enable row level security;

drop policy if exists knowledge_part_applications_read on public.knowledge_part_applications;
drop policy if exists knowledge_part_applications_manage on public.knowledge_part_applications;
create policy knowledge_part_applications_read on public.knowledge_part_applications
for select to authenticated
using (org_id = (select public.auth_org()));
create policy knowledge_part_applications_manage on public.knowledge_part_applications
for all to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
)
with check (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
);

-- A dedicated private bucket prevents confidential dealer literature from
-- being mixed with customer-facing Ari assets or deliverables.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ari-knowledge-sources', 'ari-knowledge-sources', false, 104857600, array['application/pdf'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists ari_knowledge_sources_read on storage.objects;
drop policy if exists ari_knowledge_sources_insert on storage.objects;
drop policy if exists ari_knowledge_sources_update on storage.objects;
drop policy if exists ari_knowledge_sources_delete on storage.objects;

create policy ari_knowledge_sources_read on storage.objects
for select to authenticated
using (
  bucket_id = 'ari-knowledge-sources'
  and (storage.foldername(name))[1] = (select public.auth_org())::text
);

create policy ari_knowledge_sources_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'ari-knowledge-sources'
  and (storage.foldername(name))[1] = (select public.auth_org())::text
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
);

create policy ari_knowledge_sources_update on storage.objects
for update to authenticated
using (
  bucket_id = 'ari-knowledge-sources'
  and (storage.foldername(name))[1] = (select public.auth_org())::text
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
)
with check (
  bucket_id = 'ari-knowledge-sources'
  and (storage.foldername(name))[1] = (select public.auth_org())::text
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
);

create policy ari_knowledge_sources_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'ari-knowledge-sources'
  and (storage.foldername(name))[1] = (select public.auth_org())::text
  and (select public.auth_role()) = 'owner_manager'
);

-- Replace legacy PUBLIC-role policies. The explicit authenticated target,
-- initplan-safe auth calls, and update WITH CHECK close the advisor findings.
drop policy if exists kd_read on public.knowledge_documents;
drop policy if exists kd_insert on public.knowledge_documents;
drop policy if exists kd_update on public.knowledge_documents;
drop policy if exists kd_delete on public.knowledge_documents;
drop policy if exists kc_read on public.knowledge_chunks;
drop policy if exists kc_insert on public.knowledge_chunks;
drop policy if exists kc_update on public.knowledge_chunks;
drop policy if exists kc_delete on public.knowledge_chunks;

create policy kd_read on public.knowledge_documents for select to authenticated
using (org_id = (select public.auth_org()));
create policy kd_insert on public.knowledge_documents for insert to authenticated
with check (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
);
create policy kd_update on public.knowledge_documents for update to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
)
with check (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
);
create policy kd_delete on public.knowledge_documents for delete to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) = 'owner_manager'
);

create policy kc_read on public.knowledge_chunks for select to authenticated
using (org_id = (select public.auth_org()));
create policy kc_insert on public.knowledge_chunks for insert to authenticated
with check (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
  and exists (
    select 1 from public.knowledge_documents d
    where d.id = document_id and d.org_id = (select public.auth_org())
  )
);
create policy kc_update on public.knowledge_chunks for update to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
)
with check (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
  and exists (
    select 1 from public.knowledge_documents d
    where d.id = document_id and d.org_id = (select public.auth_org())
  )
);
create policy kc_delete on public.knowledge_chunks for delete to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
);

create table if not exists public.knowledge_ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  document_id uuid references public.knowledge_documents(id) on delete set null,
  source_key text not null,
  source_sha256 text not null,
  chunk_count integer not null,
  status text not null check (status in ('succeeded', 'failed')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists knowledge_ingestion_runs_org_created_idx
  on public.knowledge_ingestion_runs(org_id, created_at desc);
alter table public.knowledge_ingestion_runs enable row level security;
drop policy if exists knowledge_ingestion_runs_read on public.knowledge_ingestion_runs;
create policy knowledge_ingestion_runs_read on public.knowledge_ingestion_runs
for select to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) in ('owner_manager', 'service_manager')
);

-- Service-role ingestion is one database transaction: an interrupted refresh
-- never leaves a half-indexed manual. Unchanged source hashes are a true no-op.
create or replace function public.ingest_knowledge_document(
  p_org uuid,
  p_document jsonb,
  p_chunks jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_document_id uuid;
  v_existing_sha text;
  v_source_key text := nullif(btrim(p_document->>'source_key'), '');
  v_source_sha text := lower(coalesce(p_document->>'source_sha256', ''));
  v_chunk_count integer := jsonb_array_length(coalesce(p_chunks, '[]'::jsonb));
begin
  if v_source_key is null then raise exception 'source_key is required'; end if;
  if v_source_sha !~ '^[0-9a-f]{64}$' then raise exception 'valid source_sha256 is required'; end if;
  if jsonb_typeof(p_chunks) <> 'array' or v_chunk_count < 1 then raise exception 'at least one chunk is required'; end if;
  if p_document->>'access_scope' not in ('staff', 'public') then raise exception 'invalid access_scope'; end if;

  select d.id, d.source_sha256 into v_document_id, v_existing_sha
  from public.knowledge_documents d
  where d.org_id = p_org and d.source_key = v_source_key
  for update;

  if v_document_id is not null and v_existing_sha = v_source_sha then
    insert into public.knowledge_ingestion_runs(
      org_id, document_id, source_key, source_sha256, chunk_count, status, detail
    ) values (
      p_org, v_document_id, v_source_key, v_source_sha, v_chunk_count, 'succeeded', 'unchanged'
    );
    return jsonb_build_object('document_id', v_document_id, 'changed', false, 'chunks', v_chunk_count);
  end if;

  insert into public.knowledge_documents as d (
    org_id, source_key, doc_type, title, source_url, effective_at, expires_at,
    status, source_kind, manufacturer, model_year_start, model_year_end,
    revision, access_scope, storage_bucket, storage_path, mime_type,
    file_size_bytes, source_sha256, citation_label, verified_at, review_due_at,
    confidentiality_note, updated_at
  ) values (
    p_org, v_source_key, p_document->>'doc_type', p_document->>'title',
    nullif(p_document->>'source_url', ''), nullif(p_document->>'effective_at', '')::date,
    nullif(p_document->>'expires_at', '')::date, coalesce(nullif(p_document->>'status', ''), 'active'),
    coalesce(nullif(p_document->>'source_kind', ''), 'internal'), nullif(p_document->>'manufacturer', ''),
    nullif(p_document->>'model_year_start', '')::integer, nullif(p_document->>'model_year_end', '')::integer,
    nullif(p_document->>'revision', ''), p_document->>'access_scope',
    nullif(p_document->>'storage_bucket', ''), nullif(p_document->>'storage_path', ''),
    nullif(p_document->>'mime_type', ''), nullif(p_document->>'file_size_bytes', '')::bigint,
    v_source_sha, nullif(p_document->>'citation_label', ''),
    coalesce(nullif(p_document->>'verified_at', '')::timestamptz, now()),
    nullif(p_document->>'review_due_at', '')::date,
    nullif(p_document->>'confidentiality_note', ''), now()
  )
  on conflict (org_id, source_key) where source_key is not null do update set
    doc_type = excluded.doc_type,
    title = excluded.title,
    source_url = excluded.source_url,
    effective_at = excluded.effective_at,
    expires_at = excluded.expires_at,
    status = excluded.status,
    source_kind = excluded.source_kind,
    manufacturer = excluded.manufacturer,
    model_year_start = excluded.model_year_start,
    model_year_end = excluded.model_year_end,
    revision = excluded.revision,
    access_scope = excluded.access_scope,
    storage_bucket = excluded.storage_bucket,
    storage_path = excluded.storage_path,
    mime_type = excluded.mime_type,
    file_size_bytes = excluded.file_size_bytes,
    source_sha256 = excluded.source_sha256,
    citation_label = excluded.citation_label,
    verified_at = excluded.verified_at,
    review_due_at = excluded.review_due_at,
    confidentiality_note = excluded.confidentiality_note,
    updated_at = now()
  returning d.id into v_document_id;

  delete from public.knowledge_chunks where document_id = v_document_id;
  insert into public.knowledge_chunks(
    document_id, org_id, chunk_index, heading, content, page_start, page_end,
    section_path, part_numbers, models, content_sha256
  )
  select
    v_document_id,
    p_org,
    x.chunk_index,
    nullif(x.heading, ''),
    x.content,
    x.page_start,
    x.page_end,
    coalesce(x.section_path, '{}'),
    coalesce(x.part_numbers, '{}'),
    coalesce(x.models, '{}'),
    x.content_sha256
  from jsonb_to_recordset(p_chunks) as x(
    chunk_index integer,
    heading text,
    content text,
    page_start integer,
    page_end integer,
    section_path text[],
    part_numbers text[],
    models text[],
    content_sha256 text
  );

  insert into public.knowledge_ingestion_runs(
    org_id, document_id, source_key, source_sha256, chunk_count, status, detail
  ) values (
    p_org, v_document_id, v_source_key, v_source_sha, v_chunk_count, 'succeeded', 'replaced'
  );

  return jsonb_build_object('document_id', v_document_id, 'changed', true, 'chunks', v_chunk_count);
end
$function$;

revoke all on function public.ingest_knowledge_document(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.ingest_knowledge_document(uuid, jsonb, jsonb) to service_role;

-- One retrieval contract for Ari and global search. Exact normalized part
-- numbers outrank prose matches; public callers cannot cross the scope filter.
create or replace function public.search_knowledge_v2(
  p_org uuid,
  p_query text,
  p_doc_types text[] default null,
  p_limit integer default 8,
  p_access_scope text default 'staff'
)
returns table(
  chunk_id uuid,
  document_id uuid,
  title text,
  doc_type text,
  manufacturer text,
  revision text,
  heading text,
  content text,
  page_start integer,
  page_end integer,
  part_numbers text[],
  models text[],
  source_url text,
  citation_label text,
  access_scope text,
  rank real
)
language plpgsql
stable
set search_path = pg_catalog, public
as $function$
declare
  q_or tsquery;
  q_and tsquery;
  compact_query text := regexp_replace(lower(coalesce(p_query, '')), '[^a-z0-9]', '', 'g');
  bounded_limit integer := least(greatest(coalesce(p_limit, 8), 1), 25);
begin
  if p_access_scope not in ('staff', 'public') then
    raise exception 'invalid knowledge access scope';
  end if;
  if nullif(btrim(coalesce(p_query, '')), '') is null then return; end if;

  q_and := websearch_to_tsquery('english', p_query);
  select to_tsquery('english', string_agg(distinct lexeme, ' | '))
  into q_or
  from unnest(tsvector_to_array(to_tsvector('english', p_query))) as lexeme;

  return query
  with candidates as (
    select
      c.*,
      d.title,
      d.doc_type,
      d.manufacturer,
      d.revision,
      d.source_url,
      d.citation_label,
      d.access_scope,
      exists (
        select 1 from unnest(c.part_numbers) pn
        where regexp_replace(lower(pn), '[^a-z0-9]', '', 'g') = compact_query
      ) as exact_part,
      case when q_or is not null then ts_rank(c.fts, q_or) else 0 end as text_rank,
      case when q_and is not null and c.fts @@ q_and then 1.0 else 0.0 end as phrase_rank
    from public.knowledge_chunks c
    join public.knowledge_documents d on d.id = c.document_id
    where d.org_id = p_org
      and c.org_id = p_org
      and d.status = 'active'
      and (d.effective_at is null or d.effective_at <= current_date)
      and (d.expires_at is null or d.expires_at >= current_date)
      and (p_doc_types is null or d.doc_type = any(p_doc_types))
      and (p_access_scope = 'staff' or d.access_scope = 'public')
      and (
        (q_or is not null and c.fts @@ q_or)
        or exists (
          select 1 from unnest(c.part_numbers) pn
          where regexp_replace(lower(pn), '[^a-z0-9]', '', 'g') = compact_query
        )
      )
  )
  select
    c.id,
    c.document_id,
    c.title,
    c.doc_type,
    c.manufacturer,
    c.revision,
    c.heading,
    c.content,
    c.page_start,
    c.page_end,
    c.part_numbers,
    c.models,
    c.source_url,
    c.citation_label,
    c.access_scope,
    (case when c.exact_part then 100.0 else 0.0 end + c.text_rank + c.phrase_rank)::real
  from candidates c
  order by c.exact_part desc, (c.text_rank + c.phrase_rank) desc, c.page_start nulls last, c.chunk_index
  limit bounded_limit;
end
$function$;

revoke all on function public.search_knowledge_v2(uuid, text, text[], integer, text) from public, anon;
grant execute on function public.search_knowledge_v2(uuid, text, text[], integer, text) to authenticated, service_role;

-- Keep older app builds compatible while they roll forward. This wrapper is
-- staff-only and inherits the caller's RLS context.
create or replace function public.search_knowledge(
  p_org uuid,
  p_query text,
  p_doc_types text[] default null,
  p_limit integer default 8
)
returns table(document_id uuid, title text, doc_type text, heading text, content text, rank real)
language sql
stable
set search_path = pg_catalog, public
as $function$
  select r.document_id, r.title, r.doc_type, r.heading, r.content, r.rank
  from public.search_knowledge_v2(p_org, p_query, p_doc_types, p_limit, 'staff') r
$function$;

revoke all on function public.search_knowledge(uuid, text, text[], integer) from public, anon;
grant execute on function public.search_knowledge(uuid, text, text[], integer) to authenticated, service_role;

-- Real per-user read watermarks replace the hard-coded inbox zero and avoid
-- a per-thread latest-message query.
create table if not exists public.communication_thread_reads (
  thread_id uuid not null references public.communication_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create index if not exists communication_thread_reads_user_org_idx
  on public.communication_thread_reads(user_id, org_id);
alter table public.communication_thread_reads enable row level security;

drop policy if exists communication_thread_reads_own on public.communication_thread_reads;
create policy communication_thread_reads_own on public.communication_thread_reads
for all to authenticated
using (user_id = (select auth.uid()) and org_id = (select public.auth_org()))
with check (user_id = (select auth.uid()) and org_id = (select public.auth_org()));

create or replace function public.list_communication_threads(p_org uuid)
returns table(
  id uuid,
  org_id uuid,
  contact_id uuid,
  thread_type text,
  last_message_at timestamptz,
  created_at timestamptz,
  contact_first_name text,
  contact_last_name text,
  contact_phone text,
  latest_message text,
  unread_count bigint
)
language sql
stable
set search_path = pg_catalog, public
as $function$
  select
    t.id, t.org_id, t.contact_id, t.thread_type, t.last_message_at, t.created_at,
    c.first_name, c.last_name, c.phone,
    coalesce(latest.body, ''),
    (
      select count(*)
      from public.messages unread
      where unread.thread_id = t.id
        and unread.sender_type <> 'agent'
        and unread.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
    ) as unread_count
  from public.communication_threads t
  join public.contacts c on c.id = t.contact_id
  left join public.communication_thread_reads r
    on r.thread_id = t.id and r.user_id = (select auth.uid())
  left join lateral (
    select m.body from public.messages m
    where m.thread_id = t.id
    order by m.created_at desc
    limit 1
  ) latest on true
  where t.org_id = p_org and p_org = (select public.auth_org())
  order by t.last_message_at desc nulls last, t.created_at desc
$function$;

create or replace function public.mark_communication_thread_read(p_thread_id uuid)
returns void
language plpgsql
volatile
set search_path = pg_catalog, public
as $function$
declare v_org uuid;
begin
  select t.org_id into v_org
  from public.communication_threads t
  where t.id = p_thread_id and t.org_id = (select public.auth_org());
  if v_org is null then raise exception 'thread not found'; end if;

  insert into public.communication_thread_reads(thread_id, user_id, org_id, last_read_at)
  values (p_thread_id, (select auth.uid()), v_org, now())
  on conflict (thread_id, user_id) do update set last_read_at = excluded.last_read_at;
end
$function$;

revoke all on function public.list_communication_threads(uuid) from public, anon;
revoke all on function public.mark_communication_thread_read(uuid) from public, anon;
grant execute on function public.list_communication_threads(uuid) to authenticated;
grant execute on function public.mark_communication_thread_read(uuid) to authenticated;

create index if not exists messages_thread_created_idx
  on public.messages(thread_id, created_at desc);
create index if not exists messages_thread_sender_created_idx
  on public.messages(thread_id, sender_type, created_at desc);
