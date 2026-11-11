-- Complete pilot RLS for administrators, assigned collectors, and residents.
-- A collector must have both the collector role and a current assignment.

create table public.collector_household_assignments (
  id uuid primary key default gen_random_uuid(),
  collector_user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete restrict,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  assignment_notes text,
  assigned_by uuid references auth.users (id) on delete set null,
  assigned_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collector_assignment_time_order check (
    ends_at is null or ends_at > starts_at
  )
);

comment on table public.collector_household_assignments is
  'Time-bounded access assignments connecting collectors to the households they are permitted to service.';

create unique index collector_household_one_open_assignment
  on public.collector_household_assignments (collector_user_id, household_id)
  where ends_at is null;

create index collector_assignments_access_lookup
  on public.collector_household_assignments (
    collector_user_id,
    household_id,
    starts_at,
    ends_at
  );

create index collector_assignments_household_idx
  on public.collector_household_assignments (household_id);

create trigger collector_assignments_set_updated_at
before update on public.collector_household_assignments
for each row execute function public.set_updated_at();

create trigger collector_assignments_audit
after insert or update or delete on public.collector_household_assignments
for each row execute function public.record_audit_log();

create function public.validate_collector_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.user_roles
    where user_id = new.collector_user_id
      and role = 'collector'
  ) then
    raise exception 'The assigned user does not have the collector role.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger collector_assignments_validate_role
before insert or update of collector_user_id
on public.collector_household_assignments
for each row execute function public.validate_collector_assignment();

create function public.can_manage_households()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role in ('super_admin', 'registration_staff')
  );
$$;

create function public.can_read_household(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.can_manage_households()
    or exists (
      select 1
      from public.household_memberships
      where household_id = target_household_id
        and user_id = (select auth.uid())
        and status = 'active'
    )
    or (
      public.has_role('collector')
      and exists (
        select 1
        from public.collector_household_assignments
        where household_id = target_household_id
          and collector_user_id = (select auth.uid())
          and starts_at <= now()
          and (ends_at is null or ends_at > now())
      )
    );
$$;

create function public.can_read_address(target_address_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    public.can_manage_households()
    or exists (
      select 1
      from public.households
      where address_id = target_address_id
        and public.can_read_household(id)
    );
$$;

revoke all on function public.can_manage_households() from public;
revoke all on function public.can_read_household(uuid) from public;
revoke all on function public.can_read_address(uuid) from public;
revoke all on function public.validate_collector_assignment() from public;

grant execute on function public.can_manage_households() to authenticated;
grant execute on function public.can_read_household(uuid) to authenticated;
grant execute on function public.can_read_address(uuid) to authenticated;

alter table public.collector_household_assignments enable row level security;

revoke all on public.collector_household_assignments from anon;
grant select, insert, update, delete
  on public.collector_household_assignments
  to authenticated;

drop policy "Registration administrators read addresses" on public.addresses;
drop policy "Registration administrators create addresses" on public.addresses;
drop policy "Registration administrators update addresses" on public.addresses;
drop policy "Authorized users read households" on public.households;
drop policy "Registration administrators create households" on public.households;
drop policy "Registration administrators update households" on public.households;
drop policy "Users read their own household membership" on public.household_memberships;
drop policy "Registration administrators create memberships" on public.household_memberships;
drop policy "Registration administrators update memberships" on public.household_memberships;

create policy "Authorized users read accessible addresses"
on public.addresses
for select
to authenticated
using ((select public.can_read_address(id)));

create policy "Household administrators create addresses"
on public.addresses
for insert
to authenticated
with check ((select public.can_manage_households()));

create policy "Household administrators update addresses"
on public.addresses
for update
to authenticated
using ((select public.can_manage_households()))
with check ((select public.can_manage_households()));

create policy "Authorized users read accessible households"
on public.households
for select
to authenticated
using ((select public.can_read_household(id)));

create policy "Household administrators create households"
on public.households
for insert
to authenticated
with check ((select public.can_manage_households()));

create policy "Household administrators update households"
on public.households
for update
to authenticated
using ((select public.can_manage_households()))
with check ((select public.can_manage_households()));

create policy "Authorized users read memberships"
on public.household_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.can_manage_households())
);

create policy "Household administrators create memberships"
on public.household_memberships
for insert
to authenticated
with check ((select public.can_manage_households()));

create policy "Household administrators update memberships"
on public.household_memberships
for update
to authenticated
using ((select public.can_manage_households()))
with check ((select public.can_manage_households()));

create policy "Authorized users read collector assignments"
on public.collector_household_assignments
for select
to authenticated
using (
  collector_user_id = (select auth.uid())
  or (select public.can_manage_households())
);

create policy "Super administrators create collector assignments"
on public.collector_household_assignments
for insert
to authenticated
with check ((select public.has_role('super_admin')));

create policy "Super administrators update collector assignments"
on public.collector_household_assignments
for update
to authenticated
using ((select public.has_role('super_admin')))
with check ((select public.has_role('super_admin')));

create policy "Super administrators delete collector assignments"
on public.collector_household_assignments
for delete
to authenticated
using ((select public.has_role('super_admin')));

