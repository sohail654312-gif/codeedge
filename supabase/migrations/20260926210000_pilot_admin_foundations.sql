-- Final completion Attempt 1: bounded operator/admin, audit, chat-abuse and CRM-link foundations.
-- This migration is forward-only and preserves the existing tenant role model.

create table public.platform_operators (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger platform_operators_updated before update on public.platform_operators
for each row execute function private.touch_updated_at();

create table public.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_scope text not null check (actor_scope in ('owner','operator','system')),
  action text not null check (char_length(action) between 3 and 120),
  target_type text not null check (char_length(target_type) between 2 and 80),
  target_id uuid,
  result text not null default 'success' check (result in ('success','denied','failed')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096)
);
create index admin_audit_business_date on public.admin_audit_events(business_id,created_at desc,id);
create index admin_audit_actor_date on public.admin_audit_events(actor_user_id,created_at desc,id);

alter table public.platform_operators enable row level security;
alter table public.platform_operators force row level security;
alter table public.admin_audit_events enable row level security;
alter table public.admin_audit_events force row level security;

revoke all on public.platform_operators, public.admin_audit_events from public,anon,authenticated;
grant select(user_id,status,created_at,updated_at) on public.platform_operators to authenticated;
grant select(id,business_id,actor_user_id,actor_scope,action,target_type,target_id,result,created_at)
  on public.admin_audit_events to authenticated;

create policy platform_operator_read_self on public.platform_operators for select to authenticated
  using(user_id=(select auth.uid()));

create function private.is_platform_operator() returns boolean
language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.platform_operators o
    where o.user_id=(select auth.uid()) and o.status='active'
  )
$$;
revoke all on function private.is_platform_operator() from public,anon;
grant execute on function private.is_platform_operator() to authenticated;

create policy admin_audit_read on public.admin_audit_events for select to authenticated using(
  (business_id is not null and private.has_business_role(business_id,array['owner']::public.business_role[]))
  or private.is_platform_operator()
);

create function public.list_business_memberships(target_business uuid)
returns table(
  user_id uuid,
  email text,
  display_name text,
  role public.business_role,
  status public.membership_status,
  created_at timestamptz
)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null
    or not private.has_business_role(target_business,array['owner']::public.business_role[])
  then
    raise exception 'Owner access required';
  end if;
  return query
    select m.user_id,u.email::text,p.display_name,m.role,m.status,m.created_at
    from public.business_memberships m
    join auth.users u on u.id=m.user_id
    left join public.profiles p on p.id=m.user_id
    where m.business_id=target_business
    order by case when m.role='owner' then 0 else 1 end,u.email,m.user_id;
end
$$;
revoke all on function public.list_business_memberships(uuid) from public,anon;
grant execute on function public.list_business_memberships(uuid) to authenticated;

create function private.current_aal2() returns boolean
language sql stable set search_path='' as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'aal',
    ''
  ) = 'aal2'
$$;
revoke all on function private.current_aal2() from public,anon,authenticated;
grant execute on function private.current_aal2() to authenticated;

-- Phase 8B actions already require AAL2 in server code. Repeat the same boundary
-- in RLS so a user cannot bypass those actions by calling the Data API directly.
drop policy businesses_update_owner on public.businesses;
create policy businesses_update_owner on public.businesses for update to authenticated
  using (
    private.has_business_role(id,array['owner']::public.business_role[])
    and private.current_aal2()
  )
  with check (
    private.has_business_role(id,array['owner']::public.business_role[])
    and private.current_aal2()
  );

drop policy business_profiles_delete on public.business_profiles;
create policy business_profiles_delete on public.business_profiles for delete to authenticated
  using (
    private.has_business_role(business_id,array['owner']::public.business_role[])
    and private.current_aal2()
  );

drop policy services_delete on public.services;
create policy services_delete on public.services for delete to authenticated
  using (
    private.has_business_role(business_id,array['owner']::public.business_role[])
    and private.current_aal2()
  );

drop policy service_areas_delete on public.service_areas;
create policy service_areas_delete on public.service_areas for delete to authenticated
  using (
    private.has_business_role(business_id,array['owner']::public.business_role[])
    and private.current_aal2()
  );

drop policy business_faqs_delete on public.business_faqs;
create policy business_faqs_delete on public.business_faqs for delete to authenticated
  using (
    private.has_business_role(business_id,array['owner']::public.business_role[])
    and private.current_aal2()
  );

drop policy business_settings_insert on public.business_settings;
create policy business_settings_insert on public.business_settings for insert to authenticated
  with check (
    private.has_business_role(business_id,array['owner']::public.business_role[])
    and private.current_aal2()
  );

drop policy business_settings_update on public.business_settings;
create policy business_settings_update on public.business_settings for update to authenticated
  using (
    private.has_business_role(business_id,array['owner']::public.business_role[])
    and private.current_aal2()
  )
  with check (
    private.has_business_role(business_id,array['owner']::public.business_role[])
    and private.current_aal2()
  );

drop policy leads_delete on public.leads;
create policy leads_delete on public.leads for delete to authenticated
  using (
    private.has_business_role(business_id,array['owner']::public.business_role[])
    and private.current_aal2()
  );

create function private.audit_privileged_owner_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  payload jsonb;
  tenant uuid;
  target uuid;
  action_name text;
  actor uuid:=auth.uid();
begin
  if actor is null then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;

  payload:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  tenant:=case
    when tg_table_name='businesses' then (payload->>'id')::uuid
    else (payload->>'business_id')::uuid
  end;
  target:=coalesce((payload->>'id')::uuid,tenant);
  action_name:=case
    when tg_table_name='businesses' then 'business.rename'
    when tg_table_name='business_settings' then 'settings.write'
    when tg_table_name='business_profiles' then 'profile.delete'
    when tg_table_name='services' then 'service.delete'
    when tg_table_name='service_areas' then 'service_area.delete'
    when tg_table_name='business_faqs' then 'faq.delete'
    when tg_table_name='leads' then 'lead.delete'
    else 'owner.privileged_mutation'
  end;

  insert into public.admin_audit_events(
    business_id,actor_user_id,actor_scope,action,target_type,target_id,result
  ) values(
    tenant,actor,'owner',action_name,tg_table_name,target,'success'
  );

  if tg_op='DELETE' then return old; else return new; end if;
end
$$;
revoke all on function private.audit_privileged_owner_mutation() from public,anon,authenticated;

create trigger audit_business_rename after update on public.businesses
for each row execute function private.audit_privileged_owner_mutation();
create trigger audit_profile_delete after delete on public.business_profiles
for each row execute function private.audit_privileged_owner_mutation();
create trigger audit_service_delete after delete on public.services
for each row execute function private.audit_privileged_owner_mutation();
create trigger audit_service_area_delete after delete on public.service_areas
for each row execute function private.audit_privileged_owner_mutation();
create trigger audit_faq_delete after delete on public.business_faqs
for each row execute function private.audit_privileged_owner_mutation();
create trigger audit_settings_write after insert or update on public.business_settings
for each row execute function private.audit_privileged_owner_mutation();
create trigger audit_lead_delete after delete on public.leads
for each row execute function private.audit_privileged_owner_mutation();

create function public.operator_list_businesses()
returns table(
  id uuid,
  name text,
  slug text,
  status public.business_status,
  active_members bigint
)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_platform_operator() or not private.current_aal2() then
    raise exception 'Operator MFA required';
  end if;
  return query
    select b.id,b.name,b.slug,b.status,
      count(m.user_id) filter (where m.status='active') as active_members
    from public.businesses b
    left join public.business_memberships m on m.business_id=b.id
    group by b.id,b.name,b.slug,b.status
    order by b.created_at desc,b.id
    limit 100;
end
$$;

create function public.operator_list_memberships(target_business uuid)
returns table(
  user_id uuid,
  email text,
  role public.business_role,
  status public.membership_status,
  created_at timestamptz
)
language plpgsql stable security definer set search_path='' as $$
begin
  if not private.is_platform_operator() or not private.current_aal2() then
    raise exception 'Operator MFA required';
  end if;
  return query
    select m.user_id,u.email::text,m.role,m.status,m.created_at
    from public.business_memberships m
    join auth.users u on u.id=m.user_id
    where m.business_id=target_business
    order by case when m.role='owner' then 0 else 1 end,u.email,m.user_id;
end
$$;

create function public.operator_provision_business(
  target_name text,
  target_slug text,
  target_user uuid
) returns uuid
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  created_business uuid;
begin
  if actor is null or not private.is_platform_operator() or not private.current_aal2() then
    raise exception 'Operator MFA required';
  end if;
  if target_user is null or target_user=actor then raise exception 'Invalid owner target'; end if;

  insert into public.businesses(name,slug)
  values(btrim(target_name),lower(btrim(target_slug)))
  returning id into created_business;

  insert into public.business_memberships(business_id,user_id,role,status)
  values(created_business,target_user,'owner','active');

  insert into public.admin_audit_events(
    business_id,actor_user_id,actor_scope,action,target_type,target_id,result
  ) values(
    created_business,actor,'operator','business.provision','business',created_business,'success'
  );
  return created_business;
end
$$;

create function public.operator_activate_staff(
  target_business uuid,
  target_user uuid
) returns void
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  existing_role public.business_role;
begin
  if actor is null or not private.is_platform_operator() or not private.current_aal2() then
    raise exception 'Operator MFA required';
  end if;
  if target_user is null or target_user=actor then raise exception 'Invalid staff target'; end if;
  if not exists(select 1 from public.businesses b where b.id=target_business and b.status='active') then
    raise exception 'Business unavailable';
  end if;

  select m.role into existing_role
  from public.business_memberships m
  where m.business_id=target_business and m.user_id=target_user
  for update;
  if existing_role='owner' then raise exception 'Owner membership cannot be changed'; end if;

  insert into public.business_memberships(business_id,user_id,role,status)
  values(target_business,target_user,'staff','active')
  on conflict(business_id,user_id)
  do update set role='staff',status='active';

  insert into public.admin_audit_events(
    business_id,actor_user_id,actor_scope,action,target_type,target_id,result
  ) values(
    target_business,actor,'operator','membership.staff.activate','business_membership',target_user,'success'
  );
end
$$;

create function public.operator_revoke_staff(
  target_business uuid,
  target_user uuid
) returns void
language plpgsql security definer set search_path='' as $$
declare
  actor uuid:=auth.uid();
  existing_role public.business_role;
begin
  if actor is null or not private.is_platform_operator() or not private.current_aal2() then
    raise exception 'Operator MFA required';
  end if;
  select m.role into existing_role
  from public.business_memberships m
  where m.business_id=target_business and m.user_id=target_user and m.status='active'
  for update;
  if existing_role is null or existing_role<>'staff' then raise exception 'Active staff membership unavailable'; end if;

  update public.business_memberships
  set status='revoked'
  where business_id=target_business and user_id=target_user and role='staff';

  insert into public.admin_audit_events(
    business_id,actor_user_id,actor_scope,action,target_type,target_id,result
  ) values(
    target_business,actor,'operator','membership.staff.revoke','business_membership',target_user,'success'
  );
end
$$;

revoke all on function public.operator_list_businesses(),
  public.operator_list_memberships(uuid),
  public.operator_provision_business(text,text,uuid),
  public.operator_activate_staff(uuid,uuid),
  public.operator_revoke_staff(uuid,uuid)
from public,anon;
grant execute on function public.operator_list_businesses(),
  public.operator_list_memberships(uuid),
  public.operator_provision_business(text,text,uuid),
  public.operator_activate_staff(uuid,uuid),
  public.operator_revoke_staff(uuid,uuid)
to authenticated;

create function public.revoke_staff_membership(target_business uuid,target_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  actor uuid := auth.uid();
  current_role public.business_role;
  current_status public.membership_status;
begin
  if actor is null then raise exception 'Authentication required'; end if;
  if not private.has_business_role(target_business,array['owner']::public.business_role[]) then
    raise exception 'Owner access required';
  end if;
  if not private.current_aal2() then raise exception 'MFA required'; end if;

  select role,status into current_role,current_status
  from public.business_memberships
  where business_id=target_business and user_id=target_user
  for update;

  if current_role is null or current_role <> 'staff' then
    raise exception 'Staff membership unavailable';
  end if;
  if current_status='revoked' then return; end if;

  update public.business_memberships
  set status='revoked'
  where business_id=target_business and user_id=target_user and role='staff';

  insert into public.admin_audit_events(
    business_id,actor_user_id,actor_scope,action,target_type,target_id,result
  ) values(
    target_business,actor,'owner','membership.revoke','business_membership',target_user,'success'
  );
end
$$;
revoke all on function public.revoke_staff_membership(uuid,uuid) from public,anon;
grant execute on function public.revoke_staff_membership(uuid,uuid) to authenticated;

-- The visitor channel can safely return at most 4,000 characters in one approved
-- assistant message. Keep FAQ authoring within the same delivery boundary instead
-- of accepting knowledge that the AI path cannot faithfully return.
alter table public.business_faqs
  add constraint business_faqs_ai_delivery_length
  check (char_length(answer) <= 4000);

-- Public chat already has per-session limits. Add a cross-session per-widget hourly
-- budget so many fresh sessions cannot bypass the message/provider-cost boundary.
create function private.consume_chat_message_budget() returns void
language plpgsql security definer set search_path='' as $$
declare
  tenant uuid;
  widget uuid;
begin
  tenant:=private.chat_business();
  widget:=nullif(current_setting('codeedge.widget',true),'')::uuid;
  if tenant is null or widget is null or private.chat_session() is null then
    raise exception 'Chat unavailable';
  end if;
  perform 1 from public.chat_widgets where business_id=tenant and id=widget for update;
  if (
    select count(*)
    from public.messages m
    join public.conversations c
      on c.business_id=m.business_id and c.id=m.conversation_id
    where c.business_id=tenant and c.widget_id=widget
      and m.sender='visitor'
      and m.created_at>clock_timestamp()-interval '1 hour'
  ) >= 300 then
    raise exception 'Chat rate limit reached';
  end if;
end
$$;
revoke all on function private.consume_chat_message_budget() from public,anon,authenticated;
grant execute on function private.consume_chat_message_budget() to codeedge_chat_api;

-- Link website-chat service text to a canonical active service when it exactly
-- matches the configured service name; keep free text in the enquiry summary too.
revoke all on function private.capture_chat_lead(text,text,text,text) from codeedge_chat_api;
drop function private.capture_chat_lead(text,text,text,text);
create function private.capture_chat_lead(
  contact_name text,
  phone text,
  email text,
  summary text,
  requested_service text
) returns void
language plpgsql security definer set search_path='' as $$
declare
  session public.conversations;
  result uuid;
  canonical_service uuid;
begin
  select * into session from public.conversations where id=private.chat_session() for update;
  if session.id is null then raise exception 'Chat unavailable'; end if;
  if session.lead_id is not null then return; end if;

  if nullif(btrim(requested_service),'') is not null then
    select s.id into canonical_service
    from public.services s
    where s.business_id=session.business_id
      and s.active
      and lower(btrim(s.name))=lower(btrim(requested_service))
    order by s.display_order,s.id
    limit 1;
  end if;

  insert into public.leads(
    business_id,contact_name,phone,email,enquiry_summary,source,service_id
  ) values(
    session.business_id,contact_name,phone,email,summary,'website',canonical_service
  ) returning id into result;
  update public.conversations set lead_id=result,updated_at=clock_timestamp() where id=session.id;
end
$$;
revoke all on function private.capture_chat_lead(text,text,text,text,text) from public,anon,authenticated;
grant execute on function private.capture_chat_lead(text,text,text,text,text) to codeedge_chat_api;

create index conversations_business_updated on public.conversations(business_id,updated_at desc,id);
