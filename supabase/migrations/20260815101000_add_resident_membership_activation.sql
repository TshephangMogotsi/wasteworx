-- A signed-in resident can activate only memberships already linked to their
-- Auth user by the server-side invitation workflow.

create function public.activate_my_household_memberships()
returns table (
  membership_id uuid,
  household_id uuid,
  membership_activated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  activation_time timestamptz := clock_timestamp();
begin
  if actor_user_id is null then
    raise exception 'Sign in before activating a household membership.'
      using errcode = '42501';
  end if;

  update public.household_memberships membership
  set
    status = 'active',
    activated_at = activation_time
  where membership.user_id = actor_user_id
    and membership.status = 'invited';

  update public.households household
  set status = 'active'
  where household.status in ('pending', 'verified')
    and exists (
      select 1
      from public.household_memberships membership
      where membership.household_id = household.id
        and membership.user_id = actor_user_id
        and membership.status = 'active'
    );

  return query
  select
    membership.id,
    membership.household_id,
    membership.activated_at
  from public.household_memberships membership
  where membership.user_id = actor_user_id
    and membership.status = 'active';
end;
$$;

comment on function public.activate_my_household_memberships() is
  'Idempotently activates household memberships already linked to the signed-in Auth user.';

revoke all on function public.activate_my_household_memberships() from public;
grant execute on function public.activate_my_household_memberships() to authenticated;
