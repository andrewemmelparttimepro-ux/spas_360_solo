-- Monthly paid-commission rows for the owner-only tracker. Commission amounts
-- are generated from the sale amount and percentage so displayed totals cannot
-- drift from their inputs.

create table public.paid_commissions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  commission_month date not null,
  salesperson_name text not null,
  customer_name text not null,
  sale_amount numeric(12, 2) not null,
  commission_percentage numeric(7, 4) not null,
  commission_amount numeric(12, 2)
    generated always as (round(sale_amount * commission_percentage / 100, 2)) stored,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint paid_commissions_month_start_check
    check (commission_month = date_trunc('month', commission_month)::date),
  constraint paid_commissions_salesperson_check
    check (salesperson_name in ('Alex', 'Ben', 'Grace', 'Bryson', 'David', 'Bad')),
  constraint paid_commissions_customer_name_check
    check (char_length(btrim(customer_name)) between 1 and 200),
  constraint paid_commissions_sale_amount_check
    check (sale_amount > 0),
  constraint paid_commissions_percentage_check
    check (commission_percentage >= 0 and commission_percentage <= 100)
);

create index paid_commissions_org_month_salesperson_idx
  on public.paid_commissions (org_id, commission_month desc, salesperson_name, created_at, id);

create index paid_commissions_created_by_idx
  on public.paid_commissions (created_by);

create trigger paid_commissions_set_updated_at
  before update on public.paid_commissions
  for each row execute function public.update_updated_at();

alter table public.paid_commissions enable row level security;

create policy paid_commissions_select on public.paid_commissions
  for select
  to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
  );

create policy paid_commissions_insert on public.paid_commissions
  for insert
  to authenticated
  with check (
    org_id = (select public.auth_org())
    and created_by = (select auth.uid())
    and (select public.auth_role()) = 'owner_manager'
  );

create policy paid_commissions_update on public.paid_commissions
  for update
  to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
  )
  with check (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
  );

create policy paid_commissions_delete on public.paid_commissions
  for delete
  to authenticated
  using (
    org_id = (select public.auth_org())
    and (select public.auth_role()) = 'owner_manager'
  );

-- Opt in only the authenticated owner workflow to the Data API. The immutable
-- tenant/author fields and generated amount cannot be rewritten by clients.
revoke all on table public.paid_commissions from anon, authenticated;
grant select on table public.paid_commissions to authenticated;
grant insert (
  org_id, commission_month, salesperson_name, customer_name,
  sale_amount, commission_percentage, created_by
) on table public.paid_commissions to authenticated;
grant update (
  commission_month, salesperson_name, customer_name,
  sale_amount, commission_percentage
) on table public.paid_commissions to authenticated;
grant delete on table public.paid_commissions to authenticated;

comment on table public.paid_commissions is
  'Owner-managed monthly paid commissions, grouped by the dealership salesperson labels requested by Brandon.';
comment on column public.paid_commissions.commission_amount is
  'Generated currency amount: sale_amount multiplied by commission_percentage, divided by 100, rounded to cents.';
