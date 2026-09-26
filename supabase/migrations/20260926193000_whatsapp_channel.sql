-- Phase 7: provider-neutral WhatsApp channel foundation.
-- Business ownership is resolved only from a trusted phone-number mapping after a
-- verified webhook. Live provider credentials are never stored in the database.

do $$ begin
  if not exists(select 1 from pg_roles where rolname='codeedge_whatsapp_api') then
    create role codeedge_whatsapp_api nologin noinherit nobypassrls;
  elsif exists(select 1 from pg_roles where rolname='codeedge_whatsapp_api' and
    (rolsuper or rolbypassrls or rolcanlogin or rolinherit or rolcreaterole or rolcreatedb or rolreplication)) then
    raise exception 'Unsafe pre-existing WhatsApp role';
  end if;
end $$;
grant codeedge_whatsapp_api to postgres;
grant usage on schema public, private to codeedge_whatsapp_api;

-- Generalise the existing conversation envelope without weakening the web-chat
-- capability. Web sessions keep their widget/hash/expiry requirements; external
-- WhatsApp conversations cannot populate those web-only fields.
alter table public.conversations drop constraint conversations_channel_check;
alter table public.conversations alter column widget_id drop not null;
alter table public.conversations alter column session_hash drop not null;
alter table public.conversations alter column expires_at drop not null;
alter table public.conversations add constraint conversations_channel_check
  check(channel in ('web_chat','whatsapp'));
alter table public.conversations add constraint conversations_channel_shape check(
  (channel='web_chat' and widget_id is not null and session_hash is not null and expires_at is not null)
  or
  (channel='whatsapp' and widget_id is null and session_hash is null and expires_at is null)
);
alter table public.messages add constraint messages_business_id_id_unique unique(business_id,id);

create table public.whatsapp_channels (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  phone_number_id text not null unique check(phone_number_id ~ '^[0-9]{5,32}$'),
  business_account_id text not null check(business_account_id ~ '^[0-9]{5,32}$'),
  display_phone_number text not null default '' check(char_length(display_phone_number) <= 40),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(business_id,id)
);

create table public.whatsapp_threads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  channel_id uuid not null,
  wa_contact_id text not null check(wa_contact_id ~ '^[0-9]{5,32}$'),
  conversation_id uuid not null,
  profile_name text not null default '' check(char_length(profile_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(business_id,channel_id) references public.whatsapp_channels(business_id,id) on delete cascade,
  foreign key(business_id,conversation_id) references public.conversations(business_id,id) on delete cascade,
  unique(channel_id,wa_contact_id),
  unique(business_id,conversation_id)
);

create table public.whatsapp_inbound_events (
  provider_message_id text primary key check(char_length(provider_message_id) between 1 and 200),
  business_id uuid not null,
  channel_id uuid not null,
  conversation_id uuid not null,
  received_at timestamptz not null default clock_timestamp(),
  foreign key(business_id,channel_id) references public.whatsapp_channels(business_id,id) on delete cascade,
  foreign key(business_id,conversation_id) references public.conversations(business_id,id) on delete cascade
);

create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  channel_id uuid not null,
  conversation_id uuid not null,
  message_id uuid not null,
  recipient_id text not null check(recipient_id ~ '^[0-9]{5,32}$'),
  body text not null check(char_length(btrim(body)) between 1 and 4000),
  source_event_id text references public.whatsapp_inbound_events(provider_message_id) on delete set null,
  status text not null default 'pending' check(status in ('pending','sent','failed')),
  provider_message_id text check(provider_message_id is null or char_length(provider_message_id) between 1 and 200),
  attempt_count integer not null default 0 check(attempt_count >= 0),
  last_error text check(last_error is null or char_length(last_error) <= 300),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  foreign key(business_id,channel_id) references public.whatsapp_channels(business_id,id) on delete cascade,
  foreign key(business_id,conversation_id) references public.conversations(business_id,id) on delete cascade,
  foreign key(business_id,message_id) references public.messages(business_id,id) on delete cascade,
  unique(message_id)
);

create index whatsapp_threads_conversation on public.whatsapp_threads(business_id,conversation_id);
create index whatsapp_outbox_delivery on public.whatsapp_outbox(business_id,status,created_at);

create trigger whatsapp_channels_updated before update on public.whatsapp_channels
  for each row execute function private.touch_updated_at();
create trigger whatsapp_threads_updated before update on public.whatsapp_threads
  for each row execute function private.touch_updated_at();
create trigger whatsapp_outbox_updated before update on public.whatsapp_outbox
  for each row execute function private.touch_updated_at();

alter table public.whatsapp_channels enable row level security;
alter table public.whatsapp_channels force row level security;
alter table public.whatsapp_threads enable row level security;
alter table public.whatsapp_threads force row level security;
alter table public.whatsapp_inbound_events enable row level security;
alter table public.whatsapp_inbound_events force row level security;
alter table public.whatsapp_outbox enable row level security;
alter table public.whatsapp_outbox force row level security;

revoke all on public.whatsapp_channels, public.whatsapp_threads, public.whatsapp_inbound_events, public.whatsapp_outbox from anon, authenticated;
grant select(id,business_id,display_phone_number,enabled,created_at,updated_at) on public.whatsapp_channels to authenticated;
create policy whatsapp_channel_member_read on public.whatsapp_channels for select to authenticated
  using(private.has_business_role(business_id,array['owner','staff']::public.business_role[]));

-- Trusted webhook context. The app verifies the provider signature before setting
-- this value. The database still resolves the tenant from its own channel mapping.
create function private.whatsapp_channel() returns uuid
language sql stable security definer set search_path='' as $$
  select c.id
  from public.whatsapp_channels c
  join public.businesses b on b.id=c.business_id
  where c.phone_number_id=current_setting('codeedge.whatsapp_phone_number_id',true)
    and c.enabled and b.status='active'
$$;
create function private.whatsapp_business() returns uuid
language sql stable security definer set search_path='' as $$
  select c.business_id from public.whatsapp_channels c where c.id=private.whatsapp_channel()
$$;
revoke all on function private.whatsapp_channel(), private.whatsapp_business() from public, anon, authenticated;
grant execute on function private.whatsapp_channel(), private.whatsapp_business() to codeedge_whatsapp_api;

grant select on public.whatsapp_channels, public.whatsapp_threads, public.whatsapp_inbound_events, public.whatsapp_outbox to codeedge_whatsapp_api;
grant insert(business_id,channel,expires_at) on public.conversations to codeedge_whatsapp_api;
grant select on public.conversations to codeedge_whatsapp_api;
grant update(updated_at) on public.conversations to codeedge_whatsapp_api;
grant select on public.messages to codeedge_whatsapp_api;
grant insert(business_id,conversation_id,sender,content,request_id) on public.messages to codeedge_whatsapp_api;
grant insert(business_id,channel_id,wa_contact_id,conversation_id,profile_name) on public.whatsapp_threads to codeedge_whatsapp_api;
grant update(profile_name) on public.whatsapp_threads to codeedge_whatsapp_api;
grant insert(provider_message_id,business_id,channel_id,conversation_id) on public.whatsapp_inbound_events to codeedge_whatsapp_api;
grant insert(business_id,channel_id,conversation_id,message_id,recipient_id,body,source_event_id) on public.whatsapp_outbox to codeedge_whatsapp_api;
grant update(status,provider_message_id,attempt_count,last_error) on public.whatsapp_outbox to codeedge_whatsapp_api;

create policy whatsapp_channel_capability_read on public.whatsapp_channels for select to codeedge_whatsapp_api
  using(id=private.whatsapp_channel());
create policy whatsapp_conversation_read on public.conversations for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and channel='whatsapp');
create policy whatsapp_conversation_create on public.conversations for insert to codeedge_whatsapp_api
  with check(business_id=private.whatsapp_business() and channel='whatsapp' and widget_id is null and session_hash is null and expires_at is null);
create policy whatsapp_conversation_touch on public.conversations for update to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and channel='whatsapp')
  with check(business_id=private.whatsapp_business() and channel='whatsapp');
create policy whatsapp_message_read on public.messages for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and exists(
    select 1 from public.conversations c where c.id=messages.conversation_id
      and c.business_id=messages.business_id and c.channel='whatsapp'
  ));
create policy whatsapp_message_create on public.messages for insert to codeedge_whatsapp_api
  with check(business_id=private.whatsapp_business() and sender in ('visitor','assistant') and created_by is null and exists(
    select 1 from public.conversations c where c.id=messages.conversation_id
      and c.business_id=messages.business_id and c.channel='whatsapp'
  ));
create policy whatsapp_thread_read on public.whatsapp_threads for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel());
create policy whatsapp_thread_create on public.whatsapp_threads for insert to codeedge_whatsapp_api
  with check(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel());
create policy whatsapp_thread_update on public.whatsapp_threads for update to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel())
  with check(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel());
create policy whatsapp_event_read on public.whatsapp_inbound_events for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel());
create policy whatsapp_event_create on public.whatsapp_inbound_events for insert to codeedge_whatsapp_api
  with check(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel());
create policy whatsapp_outbox_read on public.whatsapp_outbox for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel());
create policy whatsapp_outbox_create on public.whatsapp_outbox for insert to codeedge_whatsapp_api
  with check(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel());
create policy whatsapp_outbox_update on public.whatsapp_outbox for update to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel())
  with check(business_id=private.whatsapp_business() and channel_id=private.whatsapp_channel());

-- Give the WhatsApp capability only the same approved knowledge reads as web chat.
grant select(id,name,timezone) on public.businesses to codeedge_whatsapp_api;
grant select(business_id,trading_name,phone,email,website,address,description,category) on public.business_profiles to codeedge_whatsapp_api;
grant select(id,business_id,name,description,active,starting_price_pence,quote_required,display_order) on public.services to codeedge_whatsapp_api;
grant select(id,business_id,name,postcode,notes,active,display_order) on public.service_areas to codeedge_whatsapp_api;
grant select(business_id,weekday,is_closed,opens_at,closes_at) on public.opening_hours to codeedge_whatsapp_api;
grant select(id,business_id,question,answer,is_active,display_order) on public.business_faqs to codeedge_whatsapp_api;
grant select(business_id,locale) on public.business_settings to codeedge_whatsapp_api;
create policy whatsapp_business_knowledge on public.businesses for select to codeedge_whatsapp_api
  using(id=private.whatsapp_business());
create policy whatsapp_profile_knowledge on public.business_profiles for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business());
create policy whatsapp_service_knowledge on public.services for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and active);
create policy whatsapp_area_knowledge on public.service_areas for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and active);
create policy whatsapp_hours_knowledge on public.opening_hours for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business());
create policy whatsapp_faq_knowledge on public.business_faqs for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business() and is_active);
create policy whatsapp_settings_knowledge on public.business_settings for select to codeedge_whatsapp_api
  using(business_id=private.whatsapp_business());

-- Manual replies remain authenticated member actions. For WhatsApp, the RPC also
-- creates an idempotent outbox item; the server action performs provider delivery.
drop function public.handoff_reply(uuid,text,uuid);
create function public.handoff_reply(target_conversation uuid, body text, target_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid();
  session public.conversations;
  caller_role public.business_role;
  internal_message uuid;
  outbox_id uuid;
  channel_ref uuid;
  recipient text;
  provider_phone text;
begin
  if caller is null or target_request is null or char_length(btrim(coalesce(body,''))) not between 1 and 2000 then
    raise exception 'Reply unavailable';
  end if;
  select * into session from public.conversations c where c.id=target_conversation for update;
  if session.id is null or session.handling_mode <> 'human' then raise exception 'Reply unavailable'; end if;
  select m.role into caller_role
    from public.business_memberships m join public.businesses b on b.id=m.business_id
    where m.business_id=session.business_id and m.user_id=caller and m.status='active' and b.status='active';
  if caller_role is null or (caller_role <> 'owner' and session.assigned_to is distinct from caller) then
    raise exception 'Reply unavailable';
  end if;

  insert into public.messages(business_id,conversation_id,sender,content,request_id,created_by)
    values(session.business_id,session.id,'member',btrim(body),target_request,caller)
    on conflict(conversation_id,request_id,sender) do nothing returning id into internal_message;
  if internal_message is null then
    select id into internal_message from public.messages
      where conversation_id=session.id and request_id=target_request and sender='member';
  end if;

  if session.channel='whatsapp' then
    select t.channel_id,t.wa_contact_id,c.phone_number_id into channel_ref,recipient,provider_phone
      from public.whatsapp_threads t join public.whatsapp_channels c
        on c.business_id=t.business_id and c.id=t.channel_id
      where t.business_id=session.business_id and t.conversation_id=session.id and c.enabled;
    if channel_ref is null then raise exception 'Reply unavailable'; end if;
    insert into public.whatsapp_outbox(business_id,channel_id,conversation_id,message_id,recipient_id,body)
      values(session.business_id,channel_ref,session.id,internal_message,recipient,btrim(body))
      on conflict(message_id) do nothing returning id into outbox_id;
    if outbox_id is null then
      select id into outbox_id from public.whatsapp_outbox where message_id=internal_message;
    end if;
  end if;

  update public.conversations set updated_at=clock_timestamp() where id=session.id;
  return jsonb_build_object('outboxId',outbox_id,'phoneNumberId',provider_phone);
end $$;
revoke all on function public.handoff_reply(uuid,text,uuid) from public,anon;
grant execute on function public.handoff_reply(uuid,text,uuid) to authenticated;
