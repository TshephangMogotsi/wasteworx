-- Transactional event registration with friendly duplicate discovery and
-- database-level uniqueness guarantees.

create unique index household_memberships_open_email_global_unique
  on public.household_memberships (lower(email))
  where status <> 'revoked';

create unique index addresses_normalized_location_unique
  on public.addresses (
    lower(regexp_replace(trim(address_line_1), '[[:space:]]+', ' ', 'g')),
    lower(regexp_replace(trim(suburb), '[[:space:]]+', ' ', 'g')),
    lower(regexp_replace(trim(city), '[[:space:]]+', ' ', 'g'))
  );

create function public.find_household_registration_duplicates(
  candidate_email text,
  candidate_property_reference text,
  candidate_address_line_1 text,
  candidate_suburb text,
  candidate_city text
)
returns table (
  duplicate_kind text,
  record_id uuid,
  household_id uuid,
  household_code text,
  summary text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_email text := lower(trim(coalesce(candidate_email, '')));
  normalized_property_reference text := lower(trim(coalesce(candidate_property_reference, '')));
  normalized_address_line_1 text := lower(
    regexp_replace(trim(coalesce(candidate_address_line_1, '')), '[[:space:]]+', ' ', 'g')
  );
  normalized_suburb text := lower(
    regexp_replace(trim(coalesce(candidate_suburb, '')), '[[:space:]]+', ' ', 'g')
  );
  normalized_city text := lower(
    regexp_replace(trim(coalesce(candidate_city, '')), '[[:space:]]+', ' ', 'g')
  );
begin
  if not public.can_manage_households() then
    raise exception 'Only household administrators can check registration duplicates.'
      using errcode = '42501';
  end if;

  if normalized_email <> '' then
    return query
    select
      'email'::text,
      membership.id,
      household.id,
      household.household_code,
      membership.full_name || ' · ' || household.name
    from public.household_memberships membership
    join public.households household on household.id = membership.household_id
    where lower(membership.email) = normalized_email
      and membership.status <> 'revoked';
  end if;

  if normalized_property_reference <> ''
    or (
      normalized_address_line_1 <> ''
      and normalized_suburb <> ''
      and normalized_city <> ''
    )
  then
    return query
    select distinct
      'address'::text,
      address.id,
      household.id,
      household.household_code,
      concat_ws(
        ' · ',
        coalesce(household.name, 'Unassigned address'),
        address.address_line_1 || ', ' || address.suburb,
        address.property_reference
      )
    from public.addresses address
    left join public.households household on household.address_id = address.id
    where (
      normalized_property_reference <> ''
      and lower(trim(coalesce(address.property_reference, ''))) = normalized_property_reference
    )
    or (
      normalized_address_line_1 <> ''
      and normalized_suburb <> ''
      and normalized_city <> ''
      and lower(regexp_replace(trim(address.address_line_1), '[[:space:]]+', ' ', 'g')) = normalized_address_line_1
      and lower(regexp_replace(trim(address.suburb), '[[:space:]]+', ' ', 'g')) = normalized_suburb
      and lower(regexp_replace(trim(address.city), '[[:space:]]+', ' ', 'g')) = normalized_city
    );
  end if;
end;
$$;

comment on function public.find_household_registration_duplicates(text, text, text, text, text) is
  'Returns exact email, property-reference, or normalized street-address matches for authorized registration staff.';

create function public.register_household(
  household_name text,
  primary_contact_name text,
  primary_contact_email text,
  primary_contact_phone text,
  property_reference text,
  address_line_1 text,
  address_line_2 text,
  suburb text,
  city text,
  district text,
  access_notes text,
  operational_notes text,
  verification_method text,
  consent_version text
)
returns table (
  created_household_id uuid,
  created_address_id uuid,
  created_membership_id uuid,
  created_household_code text
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  actor_user_id uuid := auth.uid();
  normalized_email text := lower(trim(coalesce(primary_contact_email, '')));
  normalized_property_reference text := lower(trim(coalesce(property_reference, '')));
  normalized_address_line_1 text := lower(
    regexp_replace(trim(coalesce(address_line_1, '')), '[[:space:]]+', ' ', 'g')
  );
  normalized_suburb text := lower(
    regexp_replace(trim(coalesce(suburb, '')), '[[:space:]]+', ' ', 'g')
  );
  normalized_city text := lower(
    regexp_replace(trim(coalesce(city, '')), '[[:space:]]+', ' ', 'g')
  );
  new_address_id uuid;
  new_household_id uuid;
  new_membership_id uuid;
  new_household_code text;
begin
  if actor_user_id is null or not public.can_manage_households() then
    raise exception 'Only household administrators can register households.'
      using errcode = '42501';
  end if;

  if trim(coalesce(household_name, '')) = ''
    or trim(coalesce(primary_contact_name, '')) = ''
    or normalized_email = ''
    or normalized_address_line_1 = ''
    or normalized_suburb = ''
    or normalized_city = ''
    or trim(coalesce(verification_method, '')) = ''
    or trim(coalesce(consent_version, '')) = ''
  then
    raise exception 'Household, contact, address, verification, and consent fields are required.'
      using errcode = '22023';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid primary-contact email address.'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('wasteworx-email:' || normalized_email, 0)
  );
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'wasteworx-address:' || coalesce(
        nullif(normalized_property_reference, ''),
        normalized_address_line_1 || '|' || normalized_suburb || '|' || normalized_city
      ),
      0
    )
  );

  if exists (
    select 1
    from public.household_memberships
    where lower(email) = normalized_email
      and status <> 'revoked'
  ) then
    raise exception 'A current household membership already uses this email address.'
      using errcode = '23505',
      hint = 'Search for the existing household instead of registering another one.';
  end if;

  if exists (
    select 1
    from public.addresses existing_address
    where (
      normalized_property_reference <> ''
      and lower(trim(coalesce(existing_address.property_reference, ''))) = normalized_property_reference
    )
    or (
      lower(regexp_replace(trim(existing_address.address_line_1), '[[:space:]]+', ' ', 'g')) = normalized_address_line_1
      and lower(regexp_replace(trim(existing_address.suburb), '[[:space:]]+', ' ', 'g')) = normalized_suburb
      and lower(regexp_replace(trim(existing_address.city), '[[:space:]]+', ' ', 'g')) = normalized_city
    )
  ) then
    raise exception 'This property reference or street address is already registered.'
      using errcode = '23505',
      hint = 'Open the existing address instead of creating a duplicate.';
  end if;

  insert into public.addresses (
    property_reference,
    address_line_1,
    address_line_2,
    suburb,
    city,
    district,
    access_notes,
    verification_status,
    verification_method,
    verified_by,
    verified_at,
    created_by
  )
  values (
    nullif(upper(trim(property_reference)), ''),
    trim(address_line_1),
    nullif(trim(address_line_2), ''),
    trim(suburb),
    trim(city),
    nullif(trim(district), ''),
    nullif(trim(access_notes), ''),
    'verified',
    trim(verification_method),
    actor_user_id,
    now(),
    actor_user_id
  )
  returning id into new_address_id;

  insert into public.households (
    name,
    address_id,
    status,
    registration_source,
    operational_notes,
    consent_version,
    consented_at,
    registered_by
  )
  values (
    trim(household_name),
    new_address_id,
    'verified',
    'admin_event',
    nullif(trim(operational_notes), ''),
    trim(consent_version),
    now(),
    actor_user_id
  )
  returning id, household_code
  into new_household_id, new_household_code;

  insert into public.household_memberships (
    household_id,
    full_name,
    email,
    phone,
    member_type,
    status,
    created_by
  )
  values (
    new_household_id,
    trim(primary_contact_name),
    normalized_email,
    nullif(trim(primary_contact_phone), ''),
    'primary_contact',
    'pending',
    actor_user_id
  )
  returning id into new_membership_id;

  return query
  select new_household_id, new_address_id, new_membership_id, new_household_code;
end;
$$;

comment on function public.register_household(text, text, text, text, text, text, text, text, text, text, text, text, text, text) is
  'Atomically creates a verified event address, household, and pending primary membership after repeating duplicate checks.';

revoke all on function public.find_household_registration_duplicates(text, text, text, text, text) from public;
revoke all on function public.register_household(text, text, text, text, text, text, text, text, text, text, text, text, text, text) from public;

grant execute on function public.find_household_registration_duplicates(text, text, text, text, text)
  to authenticated;
grant execute on function public.register_household(text, text, text, text, text, text, text, text, text, text, text, text, text, text)
  to authenticated;

