-- knowledge_chunks.fts is generated from the searchable fields. PostgreSQL
-- correctly rejects explicit writes to it, so ingestion supplies only inputs.
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
