-- Add day-level payment dates so the workbook can filter an explicit owner-
-- selected period. Existing monthly rows retain their original meaning by
-- using the first day of their commission month.

alter table public.paid_commissions
  add column if not exists paid_on date;

update public.paid_commissions
set paid_on = commission_month
where paid_on is null;

alter table public.paid_commissions
  alter column paid_on set default current_date,
  alter column paid_on set not null;

create index if not exists paid_commissions_org_paid_on_salesperson_idx
  on public.paid_commissions (org_id, paid_on desc, salesperson_name, created_at, id);

grant insert (paid_on) on table public.paid_commissions to authenticated;
grant update (paid_on) on table public.paid_commissions to authenticated;

comment on column public.paid_commissions.paid_on is
  'Date the commission was paid; existing monthly tracker rows are backfilled to their commission-month start.';
