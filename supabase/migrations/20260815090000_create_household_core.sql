-- WasteWorx pilot household and access-control foundation.
-- Household records intentionally exist independently of Auth users so event
-- registration can complete even when an invitation is still pending.

create type public.app_role as enum (
  'super_admin',
  'registration_staff',
  'collector',
  'household_member',
  'hoa_viewer'
);

create type public.address_verification_status as enum (
  'pending',
  'verified',
  'rejected'
);

create type public.household_status as enum (
  'pending',
  'verified',
  'active',
  'suspended',
  'withdrawn'
);

create type public.household_member_type as enum (
  'primary_contact',
  'member'
);

create type public.membership_status as enum (
  'pending',
  'invited',
  'active',
  'revoked'
);

create type public.audit_action as enum (
  'insert',
  'update',
  'delete'
);

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

comment on table public.user_roles is
  'Application roles assigned by a super administrator. Authorization roles must never be stored in user-editable metadata.';

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  property_reference text,
  address_line_1 text not null,
  address_line_2 text,
  suburb text not null,
  city text not null default 'Gaborone',
  district text,
  postal_code text,
  country_code text not null default 'BW',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  access_notes text,
  verification_status public.address_verification_status not null default 'pending',
  verification_method text,
  verification_notes text,
  verified_by uuid references auth.users (id) on delete set null,
  verified_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint addresses_country_code_format check (country_code ~ '^[A-Z]{2}$'),
  constraint addresses_coordinates_together check (
    (latitude is null and longitude is null)
    or (latitude is not null and longitude is not null)
  ),
  constraint addresses_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint addresses_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint addresses_verification_details check (
    verification_status <> 'verified'
    or (verified_by is not null and verified_at is not null and verification_method is not null)
  )
);

comment on table public.addresses is
  'Collection properties verified by WasteWorx staff. A property may be linked to more than one household when operating rules allow it.';

create unique index addresses_property_reference_unique
  on public.addresses (lower(property_reference))
  where property_reference is not null;

create index addresses_location_search
  on public.addresses (suburb, city, address_line_1);

create index addresses_verification_status_idx
  on public.addresses (verification_status);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  household_code text not null default (
    'WWX-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))
  ),
  name text not null,
  address_id uuid not null references public.addresses (id) on delete restrict,
  status public.household_status not null default 'pending',
  registration_source text not null default 'admin_event',
  operational_notes text,
  consent_version text,
  consented_at timestamptz,
  registered_by uuid references auth.users (id) on delete set null,
  registered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_code_format check (household_code ~ '^WWX-[A-Z0-9]{6,20}$'),
  constraint households_consent_together check (
    (consent_version is null and consented_at is null)
    or (consent_version is not null and consented_at is not null)
  )
);

comment on table public.households is
  'Pilot participant household. This record is operational and does not depend on a resident having activated an Auth account.';

create unique index households_code_unique
  on public.households (upper(household_code));

create index households_address_id_idx
  on public.households (address_id);

create index households_status_idx
  on public.households (status);

create table public.household_memberships (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  full_name text not null,
  email text not null,
  phone text,
  member_type public.household_member_type not null default 'member',
  status public.membership_status not null default 'pending',
  invited_at timestamptz,
  activated_at timestamptz,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint household_memberships_email_format check (
    email = lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  constraint household_memberships_status_timestamps check (
    (status <> 'invited' or invited_at is not null)
    and (status <> 'active' or (user_id is not null and activated_at is not null))
    and (status <> 'revoked' or revoked_at is not null)
  )
);

comment on table public.household_memberships is
  'Links residents to households. user_id remains null until an Auth invitation has created or linked the account.';

create unique index household_memberships_user_unique
  on public.household_memberships (household_id, user_id)
  where user_id is not null;

create unique index household_memberships_open_email_unique
  on public.household_memberships (household_id, lower(email))
  where status <> 'revoked';

create unique index household_memberships_primary_contact_unique
  on public.household_memberships (household_id)
  where member_type = 'primary_contact' and status <> 'revoked';

create index household_memberships_user_id_idx
  on public.household_memberships (user_id)
  where user_id is not null;

create index household_memberships_status_idx
  on public.household_memberships (status);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  schema_name text not null,
  table_name text not null,
  record_id uuid,
  action public.audit_action not null,
  actor_user_id uuid,
  old_values jsonb,
  new_values jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);

comment on table public.audit_logs is
  'Append-only record of changes to pilot household and authorization data. Only super administrators can read it.';

create index audit_logs_record_idx
  on public.audit_logs (table_name, record_id, occurred_at desc);

create index audit_logs_actor_idx
  on public.audit_logs (actor_user_id, occurred_at desc)
  where actor_user_id is not null;

create index audit_logs_occurred_at_idx
  on public.audit_logs (occurred_at desc);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger addresses_set_updated_at
before update on public.addresses
for each row execute function public.set_updated_at();

create trigger households_set_updated_at
before update on public.households
for each row execute function public.set_updated_at();

create trigger household_memberships_set_updated_at
before update on public.household_memberships
for each row execute function public.set_updated_at();

create function public.record_audit_log()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_values jsonb;
  current_values jsonb;
  changed_record jsonb;
  changed_record_id uuid;
begin
  if tg_op = 'INSERT' then
    previous_values := null;
    current_values := to_jsonb(new);
    changed_record := current_values;
  elsif tg_op = 'UPDATE' then
    previous_values := to_jsonb(old);
    current_values := to_jsonb(new);
    changed_record := current_values;
  else
    previous_values := to_jsonb(old);
    current_values := null;
    changed_record := previous_values;
  end if;

  changed_record_id := coalesce(
    nullif(changed_record ->> 'id', '')::uuid,
    nullif(changed_record ->> 'user_id', '')::uuid
  );

  insert into public.audit_logs (
    schema_name,
    table_name,
    record_id,
    action,
    actor_user_id,
    old_values,
    new_values
  )
  values (
    tg_table_schema,
    tg_table_name,
    changed_record_id,
    lower(tg_op)::public.audit_action,
    auth.uid(),
    previous_values,
    current_values
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger user_roles_audit
after insert or update or delete on public.user_roles
for each row execute function public.record_audit_log();

create trigger addresses_audit
after insert or update or delete on public.addresses
for each row execute function public.record_audit_log();

create trigger households_audit
after insert or update or delete on public.households
for each row execute function public.record_audit_log();

create trigger household_memberships_audit
after insert or update or delete on public.household_memberships
for each row execute function public.record_audit_log();

create function public.has_role(required_role public.app_role)
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
      and role = required_role
  );
$$;

revoke all on function public.has_role(public.app_role) from public;
grant execute on function public.has_role(public.app_role) to authenticated;

alter table public.user_roles enable row level security;
alter table public.addresses enable row level security;
alter table public.households enable row level security;
alter table public.household_memberships enable row level security;
alter table public.audit_logs enable row level security;

revoke all on public.user_roles from anon;
revoke all on public.addresses from anon;
revoke all on public.households from anon;
revoke all on public.household_memberships from anon;
revoke all on public.audit_logs from anon;

grant select, insert, update, delete on public.user_roles to authenticated;
grant select, insert, update on public.addresses to authenticated;
grant select, insert, update on public.households to authenticated;
grant select, insert, update on public.household_memberships to authenticated;
grant select on public.audit_logs to authenticated;

create policy "Users read their own roles"
on public.user_roles
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.has_role('super_admin'))
);

create policy "Super administrators grant roles"
on public.user_roles
for insert
to authenticated
with check ((select public.has_role('super_admin')));

create policy "Super administrators update roles"
on public.user_roles
for update
to authenticated
using ((select public.has_role('super_admin')))
with check ((select public.has_role('super_admin')));

create policy "Super administrators revoke roles"
on public.user_roles
for delete
to authenticated
using ((select public.has_role('super_admin')));

create policy "Registration administrators read addresses"
on public.addresses
for select
to authenticated
using (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
  or exists (
    select 1
    from public.households h
    join public.household_memberships hm on hm.household_id = h.id
    where h.address_id = addresses.id
      and hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
);

create policy "Registration administrators create addresses"
on public.addresses
for insert
to authenticated
with check (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
);

create policy "Registration administrators update addresses"
on public.addresses
for update
to authenticated
using (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
)
with check (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
);

create policy "Authorized users read households"
on public.households
for select
to authenticated
using (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
  or exists (
    select 1
    from public.household_memberships hm
    where hm.household_id = households.id
      and hm.user_id = (select auth.uid())
      and hm.status = 'active'
  )
);

create policy "Registration administrators create households"
on public.households
for insert
to authenticated
with check (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
);

create policy "Registration administrators update households"
on public.households
for update
to authenticated
using (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
)
with check (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
);

create policy "Users read their own household membership"
on public.household_memberships
for select
to authenticated
using (
  user_id = (select auth.uid())
  or (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
);

create policy "Registration administrators create memberships"
on public.household_memberships
for insert
to authenticated
with check (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
);

create policy "Registration administrators update memberships"
on public.household_memberships
for update
to authenticated
using (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
)
with check (
  (select public.has_role('super_admin'))
  or (select public.has_role('registration_staff'))
);

create policy "Super administrators read audit logs"
on public.audit_logs
for select
to authenticated
using ((select public.has_role('super_admin')));

revoke all on function public.set_updated_at() from public;
revoke all on function public.record_audit_log() from public;

