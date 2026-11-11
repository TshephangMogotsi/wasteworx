-- Revoking the collector role must immediately remove access to assignment rows,
-- even when an assignment has not yet been closed by an administrator.

drop policy "Authorized users read collector assignments"
  on public.collector_household_assignments;

create policy "Authorized users read collector assignments"
on public.collector_household_assignments
for select
to authenticated
using (
  (
    collector_user_id = (select auth.uid())
    and (select public.has_role('collector'))
  )
  or (select public.can_manage_households())
);

