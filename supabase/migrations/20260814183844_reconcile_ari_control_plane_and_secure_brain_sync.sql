-- Reconcile the production Ari control plane and replace the original
-- fire-and-forget brain sync with a tracked, retryable, secret-backed outbox.
--
-- Runtime prerequisite (deliberately not committed):
--   vault secret name: spas_brain_sync_token

create extension if not exists supabase_vault with schema vault;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.agent_config (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  enabled boolean not null default true,
  provider text,
  model text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id),
  constraint agent_config_provider_check check (
    provider is null or provider = any (array[
      'anthropic'::text,
      'gemini'::text,
      'openai'::text,
      'glm'::text,
      'meta'::text,
      'grok'::text,
      'xai'::text,
      'thrawn'::text
    ])
  )
);

alter table public.agent_config enable row level security;

drop policy if exists agent_config_select on public.agent_config;
create policy agent_config_select
on public.agent_config
for select
to authenticated
using (org_id = (select public.auth_org()));

drop policy if exists agent_config_insert on public.agent_config;
create policy agent_config_insert
on public.agent_config
for insert
to authenticated
with check (
  org_id = (select public.auth_org())
  and (select public.auth_role()) = 'owner_manager'
  and (updated_by is null or updated_by = (select auth.uid()))
);

drop policy if exists agent_config_update on public.agent_config;
create policy agent_config_update
on public.agent_config
for update
to authenticated
using (
  org_id = (select public.auth_org())
  and (select public.auth_role()) = 'owner_manager'
)
with check (
  org_id = (select public.auth_org())
  and (select public.auth_role()) = 'owner_manager'
  and (updated_by is null or updated_by = (select auth.uid()))
);

revoke all on table public.agent_config from public, anon, authenticated;
grant select, insert, update on table public.agent_config to authenticated;
grant all on table public.agent_config to service_role;

do $$
begin
  if not exists (
    select 1
    from pg_publication p
    join pg_publication_rel pr on pr.prpubid = p.oid
    join pg_class c on c.oid = pr.prrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.pubname = 'supabase_realtime'
      and n.nspname = 'public'
      and c.relname = 'agent_config'
  ) then
    alter publication supabase_realtime add table public.agent_config;
  end if;
end
$$;

create schema if not exists brain_sync;
revoke all on schema brain_sync from public, anon, authenticated, service_role;
grant usage on schema brain_sync to postgres;

-- The production-only predecessor embedded a shared credential in function
-- source and advanced its watermark before pg_net confirmed delivery.
drop function if exists brain_sync.push();

create table if not exists brain_sync.state (
  id text primary key,
  last_synced_at timestamptz not null default 'epoch'::timestamptz
);

alter table brain_sync.state
  add column if not exists last_enqueued_at timestamptz,
  add column if not exists last_delivered_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

update brain_sync.state
set last_enqueued_at = coalesce(last_enqueued_at, last_synced_at, 'epoch'::timestamptz),
    last_delivered_at = coalesce(last_delivered_at, last_synced_at),
    updated_at = now()
where last_enqueued_at is null or last_delivered_at is null;

alter table brain_sync.state
  alter column last_enqueued_at set default 'epoch'::timestamptz,
  alter column last_enqueued_at set not null;

insert into brain_sync.state (id, last_synced_at, last_enqueued_at)
values
  ('agent_messages', 'epoch'::timestamptz, 'epoch'::timestamptz),
  ('agent_deliverables', 'epoch'::timestamptz, 'epoch'::timestamptz)
on conflict (id) do nothing;

create table if not exists brain_sync.outbox (
  id uuid primary key default gen_random_uuid(),
  stream text not null check (stream in ('agent_messages', 'agent_deliverables')),
  target_table text not null check (target_table in ('agent_events', 'deliverables')),
  watermark timestamptz not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'inflight', 'delivered')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  request_id bigint,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz,
  unique (stream, target_table, watermark)
);

create index if not exists brain_sync_outbox_dispatch_idx
  on brain_sync.outbox (status, next_attempt_at, created_at);
create index if not exists brain_sync_outbox_request_idx
  on brain_sync.outbox (request_id)
  where request_id is not null;

revoke all on all tables in schema brain_sync from public, anon, authenticated, service_role;
revoke all on all sequences in schema brain_sync from public, anon, authenticated, service_role;

create or replace function brain_sync.enqueue()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, brain_sync
as $$
declare
  message_watermark timestamptz;
  deliverable_watermark timestamptz;
  message_rows jsonb;
  deliverable_events jsonb;
  deliverable_rows jsonb;
  new_message_watermark timestamptz;
  new_deliverable_watermark timestamptz;
  enqueued integer := 0;
begin
  select last_enqueued_at
  into message_watermark
  from brain_sync.state
  where id = 'agent_messages'
  for update;

  select coalesce(jsonb_agg(x.row_data order by x.created_at), '[]'::jsonb), max(x.created_at)
  into message_rows, new_message_watermark
  from (
    select
      m.created_at,
      jsonb_build_object(
        'at', m.created_at,
        'agent_slug', 'ari',
        'actor', case when m.role = 'assistant' then 'ari' else 'spas360-user' end,
        'kind', 'message',
        'status', m.role,
        'summary', left(coalesce(nullif(m.content, ''), m.tool_name, '(no text)'), 300),
        'source_system', 'spas-360',
        'source_id', m.id::text,
        'detail', jsonb_build_object(
          'product', 'spas-360',
          'thread_id', m.thread_id,
          'role', m.role,
          'source_id', m.id
        )
      ) as row_data
    from public.agent_messages m
    where m.created_at > message_watermark
    order by m.created_at, m.id
    limit 200
  ) x;

  if jsonb_array_length(message_rows) > 0 then
    insert into brain_sync.outbox (stream, target_table, watermark, payload)
    values (
      'agent_messages',
      'agent_events',
      new_message_watermark,
      jsonb_build_object('table', 'agent_events', 'rows', message_rows, 'upsert', true)
    )
    on conflict (stream, target_table, watermark) do nothing;

    update brain_sync.state
    set last_enqueued_at = new_message_watermark,
        updated_at = now()
    where id = 'agent_messages';
    enqueued := enqueued + 1;
  end if;

  select last_enqueued_at
  into deliverable_watermark
  from brain_sync.state
  where id = 'agent_deliverables'
  for update;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'at', d.created_at,
      'agent_slug', 'ari',
      'actor', 'ari',
      'kind', 'deliverable',
      'status', d.status,
      'summary', left(coalesce(d.title, d.kind, 'deliverable'), 300),
      'source_system', 'spas-360',
      'source_id', d.id::text,
      'detail', jsonb_build_object(
        'product', 'spas-360',
        'kind', d.kind,
        'thread_id', d.thread_id,
        'source_id', d.id
      )
    ) order by d.created_at, d.id), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object(
      'agent_slug', 'ari',
      'title', left(coalesce(d.title, d.kind, 'ARI deliverable'), 300),
      'artifact_path', coalesce(d.storage_path, 'spas360://deliverable/' || d.id),
      'product_id', 'spas-360',
      'source_system', 'spas-360',
      'source_id', d.id::text
    ) order by d.created_at, d.id), '[]'::jsonb),
    max(d.created_at)
  into deliverable_events, deliverable_rows, new_deliverable_watermark
  from (
    select *
    from public.agent_deliverables
    where created_at > deliverable_watermark
    order by created_at, id
    limit 100
  ) d;

  if jsonb_array_length(deliverable_events) > 0 then
    insert into brain_sync.outbox (stream, target_table, watermark, payload)
    values
      (
        'agent_deliverables',
        'agent_events',
        new_deliverable_watermark,
        jsonb_build_object('table', 'agent_events', 'rows', deliverable_events, 'upsert', true)
      ),
      (
        'agent_deliverables',
        'deliverables',
        new_deliverable_watermark,
        jsonb_build_object('table', 'deliverables', 'rows', deliverable_rows, 'upsert', true)
      )
    on conflict (stream, target_table, watermark) do nothing;

    update brain_sync.state
    set last_enqueued_at = new_deliverable_watermark,
        updated_at = now()
    where id = 'agent_deliverables';
    enqueued := enqueued + 2;
  end if;

  return jsonb_build_object('outbox_batches', enqueued);
end
$$;

create or replace function brain_sync.dispatch(p_limit integer default 10)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, brain_sync, net, vault
as $$
declare
  sync_token text;
  item record;
  dispatched integer := 0;
  delivered integer := 0;
  retried integer := 0;
  response record;
  new_request_id bigint;
begin
  for response in
    select o.id, o.stream, o.watermark, r.status_code, r.timed_out, r.error_msg, r.content
    from brain_sync.outbox o
    join net._http_response r on r.id = o.request_id
    where o.status = 'inflight'
  loop
    if response.status_code between 200 and 299 and not coalesce(response.timed_out, false) then
      update brain_sync.outbox
      set status = 'delivered',
          delivered_at = now(),
          updated_at = now(),
          last_error = null
      where id = response.id;
      delivered := delivered + 1;
    else
      update brain_sync.outbox
      set status = 'pending',
          request_id = null,
          next_attempt_at = now() + make_interval(secs => least(3600, 30 * (2 ^ least(attempt_count, 7)))),
          updated_at = now(),
          last_error = left(coalesce(response.error_msg, response.content, 'HTTP ' || response.status_code::text), 1000)
      where id = response.id;
      retried := retried + 1;
    end if;
  end loop;

  update brain_sync.outbox
  set status = 'pending',
      request_id = null,
      next_attempt_at = now(),
      updated_at = now(),
      last_error = 'No pg_net response after 15 minutes; retrying'
  where status = 'inflight'
    and updated_at < now() - interval '15 minutes'
    and not exists (
      select 1 from net._http_response r where r.id = brain_sync.outbox.request_id
    );

  update brain_sync.state s
  set last_delivered_at = completed.watermark,
      last_synced_at = completed.watermark,
      updated_at = now()
  from (
    select o.stream, max(o.watermark) as watermark
    from brain_sync.outbox o
    where o.status = 'delivered'
      and not exists (
        select 1
        from brain_sync.outbox pending
        where pending.stream = o.stream
          and pending.watermark = o.watermark
          and pending.status <> 'delivered'
      )
    group by o.stream
  ) completed
  where s.id = completed.stream
    and (s.last_delivered_at is null or completed.watermark > s.last_delivered_at);

  select decrypted_secret
  into sync_token
  from vault.decrypted_secrets
  where name = 'spas_brain_sync_token'
  order by created_at desc
  limit 1;

  if sync_token is null or length(sync_token) < 32 then
    raise exception 'brain_sync secret spas_brain_sync_token is missing';
  end if;

  for item in
    select id, payload
    from brain_sync.outbox
    where status = 'pending'
      and next_attempt_at <= now()
    order by created_at
    limit greatest(1, least(coalesce(p_limit, 10), 25))
    for update skip locked
  loop
    select net.http_post(
      url := 'https://hgmaiotwhmegkzhlauyd.supabase.co/functions/v1/ingest',
      body := item.payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-brain-token', sync_token
      ),
      timeout_milliseconds := 8000
    ) into new_request_id;

    update brain_sync.outbox
    set status = 'inflight',
        request_id = new_request_id,
        attempt_count = attempt_count + 1,
        updated_at = now(),
        last_error = null
    where id = item.id;
    dispatched := dispatched + 1;
  end loop;

  return jsonb_build_object(
    'delivered', delivered,
    'retried', retried,
    'dispatched', dispatched
  );
end
$$;

create or replace function brain_sync.run()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, brain_sync
as $$
declare
  enqueued jsonb;
  dispatched jsonb;
begin
  enqueued := brain_sync.enqueue();
  dispatched := brain_sync.dispatch(10);
  return jsonb_build_object('enqueue', enqueued, 'dispatch', dispatched);
end
$$;

create or replace function brain_sync.probe()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, net, vault
as $$
declare
  sync_token text;
  request_id bigint;
begin
  select decrypted_secret
  into sync_token
  from vault.decrypted_secrets
  where name = 'spas_brain_sync_token'
  order by created_at desc
  limit 1;

  if sync_token is null or length(sync_token) < 32 then
    raise exception 'brain_sync secret spas_brain_sync_token is missing';
  end if;

  select net.http_post(
    url := 'https://hgmaiotwhmegkzhlauyd.supabase.co/functions/v1/ingest',
    body := jsonb_build_object('action', 'healthcheck', 'source', 'spas-360'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-brain-token', sync_token
    ),
    timeout_milliseconds := 8000
  ) into request_id;

  return request_id;
end
$$;

revoke all on function brain_sync.enqueue() from public, anon, authenticated, service_role;
revoke all on function brain_sync.dispatch(integer) from public, anon, authenticated, service_role;
revoke all on function brain_sync.run() from public, anon, authenticated, service_role;
revoke all on function brain_sync.probe() from public, anon, authenticated, service_role;
grant execute on function brain_sync.enqueue() to postgres;
grant execute on function brain_sync.dispatch(integer) to postgres;
grant execute on function brain_sync.run() to postgres;
grant execute on function brain_sync.probe() to postgres;

do $$
declare
  existing_job bigint;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'brain-sync-push'
  loop
    perform cron.unschedule(existing_job);
  end loop;

  perform cron.schedule(
    'brain-sync-push',
    '*/10 * * * *',
    'select brain_sync.run()'
  );
end
$$;
