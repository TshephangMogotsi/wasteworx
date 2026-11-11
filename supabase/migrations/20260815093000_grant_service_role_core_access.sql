-- One-time role bootstrap uses service_role. RLS is bypassed by that role, but
-- PostgreSQL table privileges are still required. Keep this deliberately narrow;
-- future Edge Functions will receive their own task-specific database functions.

grant select, insert, update on public.user_roles to service_role;
grant select on public.audit_logs to service_role;

grant usage on type public.app_role to service_role;
