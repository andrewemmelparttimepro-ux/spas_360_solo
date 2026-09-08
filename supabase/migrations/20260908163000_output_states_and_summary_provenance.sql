alter table public.agent_deliverables drop constraint agent_deliverables_status_check;
alter table public.agent_deliverables add constraint agent_deliverables_status_check check(status in ('draft','needs_input','reviewed','blocked','rendering','ready','failed','sent')) not valid;
alter table public.agent_deliverables validate constraint agent_deliverables_status_check;
alter table public.morning_summary_narrations add column if not exists source_hash text;
alter table public.morning_summary_narrations add column if not exists data_as_of timestamptz;
