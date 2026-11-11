-- Durable, rate-limited invitation state used by the admin-only Edge Functions.

create type public.invitation_delivery_status as enum (
  'started',
  'sent',
  'failed'
);

create table public.household_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.household_memberships (id) on delete restrict,
  requested_by uuid not null references auth.users (id) on delete restrict,
  delivery_status public.invitation_delivery_status not null default 'started',
  auth_user_id uuid references auth.users (id) on delete set null,
  error_code text,
  attempted_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint invitation_attempt_completion_consistent check (
    (delivery_status = 'started' and completed_at is null)
    or (delivery_status <> 'started' and completed_at is not null)
  )
);

comment on table public.household_invitation_attempts is
  'Append-oriented delivery history and rate-limit source for resident account invitations.';

create index household_invitation_attempts_membership_time_idx
  on public.household_invitation_attempts (membership_id, attempted_at desc);

create index household_invitation_attempts_actor_time_idx
  on public.household_invitation_attempts (requested_by, attempted_at desc);

create trigger household_invitation_attempts_audit
after insert or update on public.household_invitation_attempts
for each row execute function public.record_audit_log();

alter table public.household_invitation_attempts enable row level security;

revoke all on public.household_invitation_attempts from anon;
grant select on public.household_invitation_attempts to authenticated;

create policy "Household administrators read invitation attempts"
on public.household_invitation_attempts
for select
to authenticated
using ((select public.can_manage_households()));

create function public.reserve_household_invitation(target_membership_id uuid)
returns table (
  invitation_attempt_id uuid,
  membership_id uuid,
  household_id uuid,
  household_code text,
  resident_email text,
  resident_name text,
  existing_auth_user_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_membership_id uuid;
  selected_household_id uuid;
  selected_household_code text;
  selected_email text;
  selected_name text;
  selected_user_id uuid;
  selected_status public.membership_status;
  new_attempt_id uuid;
begin
  if auth.uid() is null or not public.can_manage_households() then
    raise exception 'Only household administrators can send resident invitations.'
      using errcode = '42501';
  end if;

  select
    membership.id,
    membership.household_id,
    household.household_code,
    membership.email,
    membership.full_name,
    membership.user_id,
    membership.status
  into
    selected_membership_id,
    selected_household_id,
    selected_household_code,
    selected_email,
    selected_name,
    selected_user_id,
    selected_status
  from public.household_memberships membership
  join public.households household on household.id = membership.household_id
  where membership.id = target_membership_id
  for update of membership;

  if not found then
    raise exception 'Household membership not found.' using errcode = 'P0002';
  end if;

  if selected_status in ('active', 'revoked') then
    raise exception 'This membership cannot receive an invitation in its current state.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.household_invitation_attempts attempt
    where attempt.membership_id = target_membership_id
      and attempt.attempted_at > clock_timestamp() - interval '60 seconds'
  ) then
    raise exception 'Please wait 60 seconds before sending another invitation.'
      using errcode = 'P0001', detail = 'invite_rate_limited';
  end if;

  if (
    select count(*)
    from public.household_invitation_attempts attempt
    where attempt.membership_id = target_membership_id
      and attempt.attempted_at > clock_timestamp() - interval '24 hours'
  ) >= 10 then
    raise exception 'The daily invitation limit has been reached for this resident.'
      using errcode = 'P0001', detail = 'invite_daily_limit';
  end if;

  insert into public.household_invitation_attempts (membership_id, requested_by)
  values (target_membership_id, auth.uid())
  returning id into new_attempt_id;

  return query
  select
    new_attempt_id,
    selected_membership_id,
    selected_household_id,
    selected_household_code,
    selected_email,
    selected_name,
    selected_user_id;
end;
$$;

create function public.complete_household_invitation(
  target_invitation_attempt_id uuid,
  target_auth_user_id uuid
)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  selected_membership_id uuid;
  sent_at timestamptz := clock_timestamp();
begin
  if auth.uid() is null or not public.can_manage_households() then
    raise exception 'Only household administrators can complete resident invitations.'
      using errcode = '42501';
  end if;

  if target_auth_user_id is null then
    raise exception 'An Auth user is required to complete an invitation.'
      using errcode = '22023';
  end if;

  select attempt.membership_id
  into selected_membership_id
  from public.household_invitation_attempts attempt
  where attempt.id = target_invitation_attempt_id
    and attempt.requested_by = auth.uid()
    and attempt.delivery_status = 'started'
  for update;

  if not found then
    raise exception 'Invitation attempt not found or already completed.' using errcode = 'P0002';
  end if;

  update public.household_memberships
  set
    user_id = target_auth_user_id,
    status = 'invited',
    invited_at = sent_at
  where id = selected_membership_id
    and status in ('pending', 'invited');

  if not found then
    raise exception 'The membership is no longer eligible for invitation.' using errcode = '22023';
  end if;

  insert into public.user_roles (user_id, role, granted_by)
  values (target_auth_user_id, 'household_member', auth.uid())
  on conflict (user_id, role) do nothing;

  update public.household_invitation_attempts
  set
    delivery_status = 'sent',
    auth_user_id = target_auth_user_id,
    completed_at = sent_at
  where id = target_invitation_attempt_id;

  return sent_at;
end;
$$;

create function public.fail_household_invitation(
  target_invitation_attempt_id uuid,
  target_error_code text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_manage_households() then
    raise exception 'Only household administrators can complete resident invitations.'
      using errcode = '42501';
  end if;

  update public.household_invitation_attempts
  set
    delivery_status = 'failed',
    error_code = left(regexp_replace(lower(coalesce(target_error_code, 'unknown')), '[^a-z0-9_-]+', '_', 'g'), 80),
    completed_at = clock_timestamp()
  where id = target_invitation_attempt_id
    and requested_by = auth.uid()
    and delivery_status = 'started';

  if not found then
    raise exception 'Invitation attempt not found or already completed.' using errcode = 'P0002';
  end if;
end;
$$;

comment on function public.reserve_household_invitation(uuid) is
  'Authorizes, serializes, rate-limits, and records an invitation attempt.';
comment on function public.complete_household_invitation(uuid, uuid) is
  'Links the invited Auth user, grants the resident role, and marks delivery successful.';
comment on function public.fail_household_invitation(uuid, text) is
  'Marks a reserved invitation attempt as failed using a sanitized error code.';

revoke all on function public.reserve_household_invitation(uuid) from public;
revoke all on function public.complete_household_invitation(uuid, uuid) from public;
revoke all on function public.fail_household_invitation(uuid, text) from public;

grant execute on function public.reserve_household_invitation(uuid) to authenticated;
grant execute on function public.complete_household_invitation(uuid, uuid) to authenticated;
grant execute on function public.fail_household_invitation(uuid, text) to authenticated;
