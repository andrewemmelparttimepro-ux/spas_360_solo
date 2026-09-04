-- Job Notes (Brandon, 2026-09-04): the note typed when a job is created lives
-- under Job Notes with a time stamp and author, and any submitted note can be
-- edited afterwards by its author or a manager.

alter table public.notes add column if not exists edited_at timestamptz;
alter table public.notes add column if not exists edited_by uuid references public.profiles(id) on delete set null;

drop policy if exists note_update on public.notes;
create policy note_update on public.notes
  for update to authenticated
  using (
    created_by = (select auth.uid())
    or (select public.auth_role()) in ('owner_manager', 'service_manager')
  )
  with check (
    created_by = (select auth.uid())
    or (select public.auth_role()) in ('owner_manager', 'service_manager')
  );

grant update (body, edited_at, edited_by) on table public.notes to authenticated;

-- Seed: every job whose creation description is not already a note gets one,
-- stamped with the job's creator and creation time so history reads true.
insert into public.notes (job_id, body, created_by, created_at)
select j.id, btrim(j.description), j.created_by, j.created_at
from public.jobs j
where j.description is not null and btrim(j.description) <> ''
  and not exists (
    select 1 from public.notes n where n.job_id = j.id and btrim(n.body) = btrim(j.description)
  );
