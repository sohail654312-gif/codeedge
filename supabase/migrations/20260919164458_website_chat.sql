-- No anonymous Data API access. Only the server's restricted connection can use
-- the private capability functions; JWT members retain read-only dashboard access.
-- Local database resets can preserve cluster roles. Never silently reuse a
-- conflicting role with broader attributes or privileges.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='codeedge_chat_api') then
    create role codeedge_chat_api nologin noinherit nobypassrls;
  elsif exists(select 1 from pg_roles where rolname='codeedge_chat_api' and
    (rolsuper or rolbypassrls or rolcanlogin or rolinherit or rolcreaterole or rolcreatedb or rolreplication)) then
    raise exception 'Unsafe pre-existing chat role';
  end if;
end $$;
grant codeedge_chat_api to postgres;
grant usage on schema public, private to codeedge_chat_api;

create table public.chat_widgets (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  id uuid not null default gen_random_uuid() unique,
  enabled boolean not null default false,
  unique(business_id,id)
);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  widget_id uuid not null,
  session_hash text not null unique check(session_hash ~ '^[a-f0-9]{64}$'),
  channel text not null default 'web_chat' check(channel = 'web_chat'),
  lead_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  unique(business_id,id),
  foreign key(business_id,widget_id) references public.chat_widgets(business_id,id) on delete cascade,
  foreign key(business_id,lead_id) references public.leads(business_id,id) on delete set null(lead_id)
);
create index conversations_business_date on public.conversations(business_id,created_at desc);
create index conversations_lead on public.conversations(business_id,lead_id);
create index conversations_widget_date on public.conversations(widget_id,created_at);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  conversation_id uuid not null,
  sender text not null check(sender in ('visitor','assistant')),
  content text not null check(char_length(btrim(content)) between 1 and 4000),
  request_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(business_id,conversation_id) references public.conversations(business_id,id) on delete cascade,
  unique(conversation_id,request_id,sender)
);
create index messages_conversation_date on public.messages(business_id,conversation_id,created_at,id);

alter table public.chat_widgets enable row level security;
alter table public.chat_widgets force row level security;
alter table public.conversations enable row level security;
alter table public.conversations force row level security;
alter table public.messages enable row level security;
alter table public.messages force row level security;
revoke all on public.chat_widgets, public.conversations, public.messages from anon, authenticated;
grant select on public.chat_widgets to authenticated;
grant insert(business_id,enabled), update(enabled) on public.chat_widgets to authenticated;
grant select(id,business_id,widget_id,channel,lead_id,created_at,updated_at,expires_at) on public.conversations to authenticated;
grant select on public.messages to authenticated;
create policy widget_read on public.chat_widgets for select to authenticated using(private.has_business_role(business_id,array['owner','staff']::public.business_role[]));
create policy widget_create on public.chat_widgets for insert to authenticated with check(private.has_business_role(business_id,array['owner']::public.business_role[]));
create policy widget_update on public.chat_widgets for update to authenticated using(private.has_business_role(business_id,array['owner']::public.business_role[])) with check(private.has_business_role(business_id,array['owner']::public.business_role[]));
create policy conversation_member_read on public.conversations for select to authenticated using(private.has_business_role(business_id,array['owner','staff']::public.business_role[]));
create policy message_member_read on public.messages for select to authenticated using(private.has_business_role(business_id,array['owner','staff']::public.business_role[]));

-- The widget context is set only by trusted server code, never a browser DB role.
create function private.chat_business() returns uuid language sql stable security definer set search_path='' as $$
  select w.business_id from public.chat_widgets w join public.businesses b on b.id=w.business_id
  where w.id::text=current_setting('codeedge.widget',true) and w.enabled and b.status='active'
$$;
create function private.chat_session() returns uuid language sql stable security definer set search_path='' as $$
  select c.id from public.conversations c where c.business_id=private.chat_business()
    and c.widget_id::text=current_setting('codeedge.widget',true)
    and c.session_hash=current_setting('codeedge.session_hash',true) and c.expires_at>now()
$$;
create function private.start_chat() returns uuid language plpgsql security definer set search_path='' as $$
declare tenant uuid; existing uuid; result uuid; token_hash text;
begin
  tenant:=private.chat_business(); token_hash:=current_setting('codeedge.session_hash',true);
  if tenant is null or token_hash is null or token_hash !~ '^[a-f0-9]{64}$' then raise exception 'Chat unavailable'; end if;
  -- Serialises budget checks across all application instances.
  perform 1 from public.chat_widgets where business_id=tenant for update;
  existing:=private.chat_session(); if existing is not null then return existing; end if;
  if (select count(*) from public.conversations where business_id=tenant and created_at>now()-interval '24 hours')>=100 then
    raise exception 'Chat capacity reached'; end if;
  insert into public.conversations(business_id,widget_id,session_hash)
    values(tenant,current_setting('codeedge.widget')::uuid,token_hash) returning id into result;
  return result;
end $$;
create function private.capture_chat_lead(contact_name text,phone text,email text,summary text) returns void
language plpgsql security definer set search_path='' as $$
declare session public.conversations; result uuid;
begin
  select * into session from public.conversations where id=private.chat_session() for update;
  if session.id is null then raise exception 'Chat unavailable'; end if;
  if session.lead_id is not null then return; end if;
  insert into public.leads(business_id,contact_name,phone,email,enquiry_summary,source)
    values(session.business_id,contact_name,phone,email,summary,'website') returning id into result;
  update public.conversations set lead_id=result,updated_at=now() where id=session.id;
end $$;
revoke all on function private.chat_business(),private.chat_session(),private.start_chat(),private.capture_chat_lead(text,text,text,text) from public,anon,authenticated;
grant execute on function private.chat_business(),private.chat_session(),private.start_chat(),private.capture_chat_lead(text,text,text,text) to codeedge_chat_api;
grant select on public.conversations,public.messages to codeedge_chat_api;
grant update(updated_at) on public.conversations to codeedge_chat_api;
grant insert(business_id,conversation_id,sender,content,request_id) on public.messages to codeedge_chat_api;
create policy chat_session_read on public.conversations for select to codeedge_chat_api using(id=private.chat_session());
create policy chat_session_touch on public.conversations for update to codeedge_chat_api using(id=private.chat_session()) with check(id=private.chat_session());
create policy chat_messages_read on public.messages for select to codeedge_chat_api using(conversation_id=private.chat_session());
create policy chat_messages_create on public.messages for insert to codeedge_chat_api with check(conversation_id=private.chat_session() and business_id=private.chat_business());
