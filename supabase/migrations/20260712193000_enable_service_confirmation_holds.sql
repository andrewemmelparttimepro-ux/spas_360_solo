-- Ari creates short-lived Pending Confirm jobs that require a human decision.
-- The native Agent OS and web service board share this exact record.
alter table public.jobs drop constraint if exists jobs_status_check;

alter table public.jobs add constraint jobs_status_check check (
  status = any(array[
    'Pending Confirm',
    'Delivery',
    'Parts on Order',
    'Warranty',
    'Ready for Pickup',
    'In Progress',
    'Completed',
    'Cancelled'
  ])
);
