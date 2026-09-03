-- ═══════════════════════════════════════════════════════════════════════════
-- TIER 2 · Scale & safety (2026-08-08)
-- 1. Durable rate limiting — a Postgres counter the serverless functions call,
--    replacing per-instance in-memory Maps that reset on every cold start.
-- 2. job-photos bucket goes private — customer property photos should never
--    be world-readable by URL. Clients switch to signed URLs.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1 · Durable rate limits ────────────────────────────────────────────────
create table if not exists public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 0
);

-- RLS on with no policies: only service_role (via the function below) touches it
alter table public.rate_limits enable row level security;

create or replace function public.consume_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $$
declare
  v_now timestamptz := now();
  v_row public.rate_limits;
begin
  insert into public.rate_limits as rl (key, window_start, count)
  values (p_key, v_now, 1)
  on conflict (key) do update
    set count = case when rl.window_start < v_now - make_interval(secs => p_window_seconds)
                     then 1 else rl.count + 1 end,
        window_start = case when rl.window_start < v_now - make_interval(secs => p_window_seconds)
                            then v_now else rl.window_start end
  returning * into v_row;

  -- Opportunistic hygiene: the table stays a few hundred rows at most
  if random() < 0.01 then
    delete from public.rate_limits where window_start < v_now - interval '2 days';
  end if;

  return jsonb_build_object(
    'allowed', v_row.count <= p_max,
    'remaining', greatest(p_max - v_row.count, 0),
    'retry_after_seconds', case when v_row.count <= p_max then 0
      else greatest(0, ceil(extract(epoch from (v_row.window_start + make_interval(secs => p_window_seconds) - v_now))))::int end
  );
end;
$$;

revoke execute on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- ─── 2 · Customer photos are not public documents ───────────────────────────
update storage.buckets set public = false where id = 'job-photos';
