-- Supabase grants public-schema functions to API roles by default. Trigger-only
-- helpers must never be directly callable; the navigation RPC is auth-only.
alter function public.audit_safe_uuid(text) set search_path = public, pg_temp;
alter function public.audit_record_label(text, jsonb) set search_path = public, pg_temp;
alter function public.audit_change_summary(text, jsonb, jsonb) set search_path = public, pg_temp;

revoke all privileges on function public.audit_safe_uuid(text)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.audit_record_label(text, jsonb)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.audit_change_summary(text, jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all privileges on function public.capture_team_activity()
  from public, anon, authenticated, service_role;
revoke all privileges on function public.attribute_sms_audit_requester()
  from public, anon, authenticated, service_role;

revoke all privileges on function public.record_app_activity(text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_app_activity(text, text, text)
  to authenticated;
