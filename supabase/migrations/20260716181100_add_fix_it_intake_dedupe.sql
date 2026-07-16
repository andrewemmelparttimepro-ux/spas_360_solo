alter table public.fix_it_posts
  add column if not exists source text,
  add column if not exists source_ref text,
  add column if not exists dedupe_key text;

comment on column public.fix_it_posts.source is
  'Originating surface for the request, such as ari or fix_it_feed.';

comment on column public.fix_it_posts.source_ref is
  'Optional source record or conversation identifier used for traceability.';

comment on column public.fix_it_posts.dedupe_key is
  'Stable request key used to prevent duplicate active intake cards.';

create unique index if not exists fix_it_posts_active_intake_dedupe_idx
  on public.fix_it_posts (org_id, created_by, dedupe_key)
  where archived_at is null and dedupe_key is not null;
