-- The membership check needs only the caller's self-readable allowlist row;
-- keep it SECURITY INVOKER and explicitly remove anonymous execution.
alter function public.can_use_fix_it() security invoker;
revoke all on function public.can_use_fix_it() from public, anon;
grant execute on function public.can_use_fix_it() to authenticated, service_role;

-- This function is trigger-only. PostgreSQL checks trigger-function authority
-- when the trigger is created, so browser roles never need direct execution.
revoke all on function public.notify_brandon_on_suggestion() from public, anon, authenticated;

