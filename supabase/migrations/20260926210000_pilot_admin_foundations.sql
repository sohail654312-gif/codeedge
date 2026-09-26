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
language plpgsql stable security definer set search_path='' as $
begin
  if auth.uid() is null
    or not private.has_business_role(target_business,array['owner']::public.business_role[])
  then
    raise exception 'Owner access required';
  end if;
  return query
    select m.user_id,u.email,p.display_name,m.role,m.status,m.created_at
    from public.business_memberships m
    join auth.users u on u.id=m.user_id
    left join public.profiles p on p.id=m.user_id
    where m.business_id=target_business
    order by case when m.role='owner' then 0 else 1 end,u.email,m.user_id;
end
$;
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
