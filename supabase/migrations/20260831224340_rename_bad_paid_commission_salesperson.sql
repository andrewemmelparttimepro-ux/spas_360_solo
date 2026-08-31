-- Correct the salesperson name without losing any rows entered under the
-- original misspelling. Dropping the constraint first makes the data update
-- valid against the original allowed-name list; recreating it prevents either
-- spelling from drifting back into new rows.

set lock_timeout = '5s';

alter table public.paid_commissions
  drop constraint if exists paid_commissions_salesperson_check;

update public.paid_commissions
set salesperson_name = 'Brad'
where salesperson_name = 'Bad';

alter table public.paid_commissions
  add constraint paid_commissions_salesperson_check
  check (salesperson_name in ('Alex', 'Ben', 'Grace', 'Bryson', 'David', 'Brad'));
