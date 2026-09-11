-- Account-qualified source IDs keep both Jobber stores distinct. Summaries stay
-- outside the operational jobs table until visits and cutover are reconciled.
create table public.jobber_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  location_id uuid not null references public.locations(id),
  contact_id uuid references public.contacts(id) on delete set null,
  source_account_key text not null,
  source_account_name text not null,
  source_account_id text,
  record_kind text not null check (record_kind in ('client', 'job', 'quote', 'request', 'invoice')),
  source_id text not null,
  source_url text check (source_url is null or source_url ~ '^https://secure[.]getjobber[.]com/(clients|jobs|quotes|requests|invoices)/[0-9]+$'),
  source_client_id text,
  source_number text,
  title text not null,
  client_name text not null,
  source_status text,
  occurred_at timestamptz,
  source_updated_at timestamptz,
  captured_at timestamptz not null,
  summary jsonb not null,
  raw jsonb not null,
  coverage text not null default 'summary' check (coverage in ('summary', 'detail', 'complete')),
  match_status text not null check (match_status in ('matched', 'created', 'review')),
  match_reason text not null,
  candidate_contact_ids uuid[] not null default '{}',
  source_checksum text not null,
  import_batch text not null,
  search_text text not null,
  imported_at timestamptz not null default now(),
  unique (org_id, source_account_key, record_kind, source_id)
);

create index jobber_history_location_kind_date on public.jobber_history(org_id, location_id, record_kind, occurred_at desc, id);
create index jobber_history_contact on public.jobber_history(contact_id, record_kind, occurred_at desc, id);
create index jobber_history_review on public.jobber_history(org_id, match_status, record_kind);

create function public.guard_jobber_history_relationships() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.locations where id = new.location_id and org_id = new.org_id) then
    raise exception 'Jobber history location must belong to its organization';
  end if;
  if new.contact_id is not null and not exists (
    select 1 from public.contacts where id = new.contact_id and org_id = new.org_id and location_id = new.location_id
  ) then
    raise exception 'Jobber history customer must belong to its organization and store';
  end if;
  return new;
end;
$$;
create trigger guard_jobber_history_relationships before insert or update on public.jobber_history
for each row execute function public.guard_jobber_history_relationships();

alter table public.jobber_history enable row level security;
revoke all on public.jobber_history from anon, authenticated;
grant select on public.jobber_history to authenticated;
grant all on public.jobber_history to service_role;
create policy jobber_history_read on public.jobber_history for select to authenticated
using (org_id = (select public.auth_org()) and (select public.auth_role()) in ('owner_manager', 'service_manager', 'salesperson'));

comment on table public.jobber_history is 'Captured Jobber records with account-qualified provenance and explicit coverage. A summary is not a scheduled SPAS job or a reconciled balance.';
