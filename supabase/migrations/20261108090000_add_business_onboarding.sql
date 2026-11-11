-- Business onboarding is additive: household memberships and policies are unchanged.
create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  request_key text not null,
  registered_name text not null default '',
  trading_name text not null default '',
  registration_number text,
  registration_exception text not null default '',
  country_code text not null default 'BW' check (country_code ~ '^[A-Z]{2}$'),
  industry text not null default '',
  contact_name text not null default '',
  contact_role text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  service_needs text not null default '',
  verification_status text not null default 'draft'
    check (verification_status in ('draft','submitted','under_review','changes_requested','verified','rejected')),
  service_status text not null default 'inactive' check (service_status in ('inactive','active','suspended')),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, request_key)
);
create unique index business_registration_unique on public.businesses(country_code, lower(registration_number))
  where registration_number is not null;
create unique index business_name_unique on public.businesses(country_code, lower(trim(registered_name)))
  where trim(registered_name) <> '';

create table public.business_sites (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  name text not null,
  address text not null,
  city text not null,
  contact_name text not null default '',
  contact_email text not null default '',
  contact_phone text not null default '',
  operating_hours text not null default '',
  access_notes text not null default '',
  container_notes text not null default '',
  timezone text not null default 'Africa/Gaborone',
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  service_status text not null default 'inactive' check (service_status in ('inactive','active')),
  unique (business_id, id)
);
create unique index business_site_address_unique on public.business_sites
  (business_id, lower(trim(address)), lower(trim(city))) where trim(address) <> '';
create unique index business_site_name_unique on public.business_sites(business_id,lower(trim(name))) where trim(name) <> '';

-- Internal evidence is separate from client-readable business and site records.
create table public.business_evidence (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses(id),
  reference text not null default '',
  notes text not null default ''
);
create table public.business_reviews (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  site_id uuid,
  action text not null,
  reason text not null,
  evidence_reference text not null default '',
  reviewed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (business_id, site_id) references public.business_sites(business_id,id)
);
create table public.business_memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id),
  user_id uuid references auth.users(id),
  email text not null check (email = lower(trim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  full_name text not null,
  role text not null default 'business_admin' check (role in ('business_admin','site_contact')),
  site_id uuid,
  status text not null default 'pending' check (status in ('pending','invited','active','revoked')),
  invited_at timestamptz,
  activated_at timestamptz,
  check ((role = 'business_admin' and site_id is null) or (role = 'site_contact' and site_id is not null)),
  check (status not in ('invited','active') or user_id is not null),
  foreign key (business_id, site_id) references public.business_sites(business_id,id)
);
create unique index business_membership_email_unique on public.business_memberships
  (business_id,email) where status <> 'revoked';
create index business_memberships_user_idx on public.business_memberships(user_id);
create table public.business_invitation_attempts (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.business_memberships(id),
  requested_by uuid not null references auth.users(id),
  status text not null default 'started' check (status in ('started','sent','failed','linked')),
  error_code text,
  created_at timestamptz not null default now()
);
create index business_invitation_time_idx on public.business_invitation_attempts(membership_id,created_at);

create function public.can_read_business(target_business uuid, target_site uuid default null)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_manage_households() or exists (
    select 1 from public.business_memberships m
    where m.business_id = target_business and m.user_id = auth.uid() and m.status = 'active'
      and (m.role = 'business_admin' or (target_site is not null and m.site_id = target_site))
  );
$$;

alter table public.businesses enable row level security;
alter table public.business_sites enable row level security;
alter table public.business_evidence enable row level security;
alter table public.business_reviews enable row level security;
alter table public.business_memberships enable row level security;
alter table public.business_invitation_attempts enable row level security;
revoke all on public.businesses, public.business_sites, public.business_evidence,
  public.business_reviews, public.business_memberships, public.business_invitation_attempts from anon, authenticated;
grant select on public.businesses, public.business_sites, public.business_evidence,
  public.business_reviews, public.business_memberships, public.business_invitation_attempts to authenticated;
grant all on public.businesses, public.business_sites, public.business_evidence,
  public.business_reviews, public.business_memberships, public.business_invitation_attempts to service_role;

create policy business_read on public.businesses for select to authenticated using (
  public.can_read_business(id) or exists (select 1 from public.business_memberships m
    where m.business_id = businesses.id and m.user_id = auth.uid() and m.status = 'active')
);
create policy site_read on public.business_sites for select to authenticated using (public.can_read_business(business_id,id));
create policy evidence_staff on public.business_evidence for select to authenticated using (public.can_manage_households());
create policy review_staff on public.business_reviews for select to authenticated using (public.can_manage_households());
create policy membership_read on public.business_memberships for select to authenticated
  using (public.can_manage_households() or user_id = auth.uid());
create policy attempt_staff on public.business_invitation_attempts for select to authenticated using (public.can_manage_households());

create trigger business_updated before update on public.businesses for each row execute function public.set_updated_at();
create trigger business_audit after insert or update or delete on public.businesses for each row execute function public.record_audit_log();
create trigger business_site_audit after insert or update or delete on public.business_sites for each row execute function public.record_audit_log();
create trigger business_evidence_audit after insert or update or delete on public.business_evidence for each row execute function public.record_audit_log();
create trigger business_membership_audit after insert or update or delete on public.business_memberships for each row execute function public.record_audit_log();

create function public.save_business_onboarding(payload jsonb, request_key text, target_id uuid default null, expected_version integer default 0)
returns uuid language plpgsql security definer set search_path = '' as $$
declare b public.businesses; s jsonb; saved_id uuid; submitted boolean := coalesce((payload->>'submit')::boolean,false);
begin
  if auth.uid() is null or not public.can_manage_households() then raise exception 'Staff access required.' using errcode='42501'; end if;
  if octet_length(payload::text) > 100000 or length(request_key) not between 1 and 120 then raise exception 'Registration is too large or missing its request reference.'; end if;
  if jsonb_typeof(payload->'sites') is distinct from 'array' or jsonb_array_length(payload->'sites') not between 1 and 50 then
    raise exception 'Include between one and fifty collection sites.';
  end if;
  if target_id is null then
    -- Serialize retries of the same create operation, including concurrent calls.
    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || request_key,0));
    select id into saved_id from public.businesses x where x.created_by=auth.uid() and x.request_key=save_business_onboarding.request_key;
    if saved_id is not null then return saved_id; end if;
    insert into public.businesses(request_key,created_by) values(request_key,auth.uid()) returning * into b;
  else
    select * into b from public.businesses where id=target_id for update;
    if not found then raise exception 'Business not found.'; end if;
    if b.version <> expected_version then raise exception 'This business changed. Reload before saving.' using errcode='40001'; end if;
    if b.verification_status not in ('draft','changes_requested') then raise exception 'Only drafts and requested corrections can be edited.'; end if;
  end if;
  if submitted and (
    trim(coalesce(payload->>'registered_name',''))='' or trim(coalesce(payload->>'industry',''))='' or
    trim(coalesce(payload->>'contact_name',''))='' or trim(coalesce(payload->>'contact_phone',''))='' or
    coalesce(lower(trim(payload->>'contact_email')),'') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or
    (trim(coalesce(payload->>'registration_number',''))='' and trim(coalesce(payload->>'registration_exception',''))='') or
    trim(coalesce(payload->>'evidence_reference',''))=''
  ) then raise exception 'Complete business identity, industry, contact details, registration number or exception, and evidence reference before submission.'; end if;
  update public.businesses set
    registered_name=trim(coalesce(payload->>'registered_name','')), trading_name=trim(coalesce(payload->>'trading_name','')),
    registration_number=nullif(trim(payload->>'registration_number'),''), registration_exception=trim(coalesce(payload->>'registration_exception','')),
    country_code=upper(trim(coalesce(payload->>'country_code','BW'))), industry=trim(coalesce(payload->>'industry','')),
    contact_name=trim(coalesce(payload->>'contact_name','')), contact_role=trim(coalesce(payload->>'contact_role','')),
    contact_email=lower(trim(coalesce(payload->>'contact_email',''))), contact_phone=trim(coalesce(payload->>'contact_phone','')),
    service_needs=trim(coalesce(payload->>'service_needs','')), verification_status=case when submitted then 'submitted' else b.verification_status end,
    version=b.version+1 where id=b.id;
  insert into public.business_evidence(business_id,reference,notes) values(b.id,trim(coalesce(payload->>'evidence_reference','')),trim(coalesce(payload->>'evidence_notes','')))
    on conflict (business_id) do update set reference=excluded.reference,notes=excluded.notes;
  -- Never replace or silently omit existing site identities. On correction sites are re-reviewed.
  if exists(select 1 from public.business_sites x where x.business_id=b.id and not exists(
    select 1 from jsonb_array_elements(payload->'sites') p where nullif(p->>'id','')::uuid=x.id
  )) then raise exception 'Keep all existing sites in this registration.'; end if;
  for s in select value from jsonb_array_elements(payload->'sites') loop
    if submitted and (trim(coalesce(s->>'name',''))='' or trim(coalesce(s->>'address',''))='' or trim(coalesce(s->>'city',''))='') then
      raise exception 'Complete each site name, address and city.';
    end if;
    if nullif(s->>'id','') is not null then
      update public.business_sites set name=trim(coalesce(s->>'name','')), address=trim(coalesce(s->>'address','')), city=trim(coalesce(s->>'city','')),
        contact_name=coalesce(s->>'contact_name',''),contact_email=lower(trim(coalesce(s->>'contact_email',''))),contact_phone=coalesce(s->>'contact_phone',''),
        operating_hours=coalesce(s->>'operating_hours',''),access_notes=coalesce(s->>'access_notes',''),container_notes=coalesce(s->>'container_notes',''),
        verification_status='pending',service_status='inactive'
        where id=(s->>'id')::uuid and business_id=b.id;
      if not found then raise exception 'Site does not belong to this business.'; end if;
    else
      insert into public.business_sites(business_id,name,address,city,contact_name,contact_email,contact_phone,operating_hours,access_notes,container_notes)
      values(b.id,trim(coalesce(s->>'name','')),trim(coalesce(s->>'address','')),trim(coalesce(s->>'city','')),
        coalesce(s->>'contact_name',''),lower(trim(coalesce(s->>'contact_email',''))),coalesce(s->>'contact_phone',''),
        coalesce(s->>'operating_hours',''),coalesce(s->>'access_notes',''),coalesce(s->>'container_notes',''));
    end if;
  end loop;
  return b.id;
end;
$$;

create function public.review_business_onboarding(target_id uuid, decision text, reason text, expected_version integer, target_site uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare b public.businesses;
begin
  if auth.uid() is null or not public.can_manage_households() then raise exception 'Staff access required.' using errcode='42501'; end if;
  if length(trim(coalesce(reason,''))) not between 3 and 2000 then raise exception 'Provide a review reason or evidence summary of 3 to 2000 characters.'; end if;
  select * into b from public.businesses where id=target_id for update;
  if not found then raise exception 'Business not found.'; end if;
  if b.version <> expected_version then raise exception 'This business changed. Reload before reviewing.' using errcode='40001'; end if;
  if target_site is not null then
    if b.verification_status not in ('under_review','verified') then raise exception 'Start business review before reviewing sites.'; end if;
    if not exists(select 1 from public.business_sites where id=target_site and business_id=b.id) then raise exception 'Site not found for business.'; end if;
    if decision in ('verify_site','reject_site') then
      if b.service_status='active' and exists(select 1 from public.business_sites where id=target_site and service_status='active') then
        raise exception 'Suspend business service before changing an active site verification.';
      end if;
      update public.business_sites set verification_status=case when decision='verify_site' then 'verified' else 'rejected' end,service_status='inactive'
      where id=target_site;
    elsif decision='activate_site' then
      if b.verification_status <> 'verified' then raise exception 'Verify the business first.'; end if;
      update public.business_sites set service_status='active' where id=target_site and verification_status='verified';
      if not found then raise exception 'Verify the site first.'; end if;
    else raise exception 'Unsupported site decision.'; end if;
  elsif decision='start_review' and b.verification_status='submitted' then
    update public.businesses set verification_status='under_review' where id=b.id;
  elsif decision in ('verify','request_changes','reject') and b.verification_status='under_review' then
    update public.businesses set verification_status=case decision when 'verify' then 'verified' when 'request_changes' then 'changes_requested' else 'rejected' end where id=b.id;
  elsif decision='activate' and b.verification_status='verified' and b.service_status in ('inactive','suspended') then
    if not exists(select 1 from public.business_sites where business_id=b.id and verification_status='verified' and service_status='active') then
      raise exception 'Activate at least one verified collection site first.';
    end if;
    update public.businesses set service_status='active' where id=b.id;
  elsif decision='suspend' and b.service_status='active' then
    update public.businesses set service_status='suspended' where id=b.id;
  elsif decision='reopen' and b.verification_status in ('verified','rejected') then
    update public.businesses set verification_status='changes_requested',service_status='inactive' where id=b.id;
    update public.business_sites set service_status='inactive' where business_id=b.id;
  else raise exception 'That decision is not available in the current state.'; end if;
  update public.businesses set version=version+1 where id=b.id;
  insert into public.business_reviews(business_id,site_id,action,reason,evidence_reference,reviewed_by)
    values(b.id,target_site,decision,trim(reason),coalesce((select reference from public.business_evidence where business_id=b.id),''),auth.uid());
end;
$$;

create function public.revoke_business_membership(target_membership uuid, reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare m public.business_memberships;
begin
  if auth.uid() is null or not public.can_manage_households() then raise exception 'Staff access required.' using errcode='42501'; end if;
  if length(trim(coalesce(reason,''))) not between 3 and 2000 then raise exception 'Provide a reason of 3 to 2000 characters.'; end if;
  select * into m from public.business_memberships where id=target_membership for update;
  if not found then raise exception 'Membership not found.'; end if;
  update public.business_memberships set status='revoked' where id=m.id;
  insert into public.business_reviews(business_id,action,reason,reviewed_by) values(m.business_id,'revoke_membership',trim(reason),auth.uid());
end;
$$;

-- Reservation commits before email delivery, so failures cannot erase registration.
create function public.reserve_business_invitation(target_business uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare b public.businesses; m public.business_memberships; attempt uuid; existing_user uuid;
begin
  if auth.uid() is null or not public.can_manage_households() then raise exception 'Staff access required.' using errcode='42501'; end if;
  select * into b from public.businesses where id=target_business for update;
  if not found or b.service_status <> 'active' or b.verification_status <> 'verified' then raise exception 'Activate a verified business before inviting its administrator.'; end if;
  insert into public.business_memberships(business_id,email,full_name) values(b.id,b.contact_email,b.contact_name)
    on conflict (business_id,email) where status <> 'revoked' do nothing;
  select * into m from public.business_memberships where business_id=b.id and email=b.contact_email and status <> 'revoked' for update;
  if m.status='active' then raise exception 'This administrator already has access.'; end if;
  if exists(select 1 from public.business_invitation_attempts where membership_id=m.id and created_at>now()-interval '60 seconds') or
    (select count(*) from public.business_invitation_attempts where membership_id=m.id and created_at>now()-interval '24 hours')>=10 then
    raise exception 'Invitation rate limit reached. Wait before retrying.';
  end if;
  select id into existing_user from auth.users where lower(email)=m.email and email_confirmed_at is not null;
  insert into public.business_invitation_attempts(membership_id,requested_by) values(m.id,auth.uid()) returning id into attempt;
  return jsonb_build_object('attempt_id',attempt,'membership_id',m.id,'email',m.email,'full_name',m.full_name,'existing_user_id',existing_user);
end;
$$;

-- Service-only completion checks identity against Auth, never user-editable metadata.
create function public.finish_business_invitation(attempt_id uuid, auth_user_id uuid, failure_code text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a public.business_invitation_attempts; m public.business_memberships; confirmed boolean;
begin
  select * into a from public.business_invitation_attempts where id=attempt_id for update;
  if not found or a.status<>'started' then raise exception 'Invitation reservation is not pending.'; end if;
  select * into m from public.business_memberships where id=a.membership_id for update;
  if failure_code is not null then
    update public.business_invitation_attempts set status='failed',error_code=left(failure_code,100) where id=a.id;
    return;
  end if;
  select email_confirmed_at is not null into confirmed from auth.users where id=auth_user_id and lower(email)=m.email;
  if not found then raise exception 'Invitation account does not match the reserved email.'; end if;
  if m.status='revoked' then raise exception 'Membership was revoked.'; end if;
  update public.business_memberships set user_id=auth_user_id,status=case when confirmed then 'active' else 'invited' end,
    invited_at=now(),activated_at=case when confirmed then now() else null end where id=m.id;
  update public.business_invitation_attempts set status=case when confirmed then 'linked' else 'sent' end where id=a.id;
end;
$$;

create function public.activate_my_business_memberships()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
  update public.business_memberships m set status='active',activated_at=now()
    where m.user_id=auth.uid() and m.status='invited' and exists(
      select 1 from auth.users u where u.id=auth.uid() and lower(u.email)=m.email and u.email_confirmed_at is not null);
end;
$$;

revoke all on function public.can_read_business(uuid,uuid), public.save_business_onboarding(jsonb,text,uuid,integer),
  public.review_business_onboarding(uuid,text,text,integer,uuid),public.reserve_business_invitation(uuid),
  public.finish_business_invitation(uuid,uuid,text),public.activate_my_business_memberships(),public.revoke_business_membership(uuid,text) from public;
grant execute on function public.can_read_business(uuid,uuid),public.save_business_onboarding(jsonb,text,uuid,integer),
  public.review_business_onboarding(uuid,text,text,integer,uuid),public.reserve_business_invitation(uuid),
  public.activate_my_business_memberships(),public.revoke_business_membership(uuid,text) to authenticated;
grant execute on function public.finish_business_invitation(uuid,uuid,text) to service_role;
