create type public.conversation_handling as enum ('ai','human');

alter table public.conversations
  add column handling_mode public.conversation_handling not null default 'ai',
  add column assigned_to uuid,
  add column taken_over_by uuid,
  add column taken_over_at timestamptz;

alter table public.messages drop constraint messages_sender_check;
alter table public.messages
  add column created_by uuid references auth.users(id) on delete set null,
  add constraint messages_sender_check check(sender in ('visitor','assistant','member')),
  add constraint messages_member_creator_check check(
    (sender='member' and created_by is not null)
    or (sender in ('visitor','assistant') and created_by is null)
  );

-- Existing chat tables remain read-only to browser clients. Human actions are
-- exposed only through narrowly scoped, membership-checking RPCs below.
grant select(handling_mode,assigned_to,taken_over_by,taken_over_at) on public.conversations to authenticated;

create function public.handoff_take_over(target_conversation uuid, target_assignee uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid();
  tenant uuid;
  caller_role public.business_role;
  assignee uuid;
begin
  if caller is null then raise exception 'Conversation unavailable'; end if;
  select c.business_id into tenant from public.conversations c where c.id=target_conversation for update;
  if tenant is null then raise exception 'Conversation unavailable'; end if;
  select m.role into caller_role
    from public.business_memberships m join public.businesses b on b.id=m.business_id
    where m.business_id=tenant and m.user_id=caller and m.status='active' and b.status='active';
  if caller_role is null then raise exception 'Conversation unavailable'; end if;
  assignee := coalesce(target_assignee, caller);
  if assignee <> caller and caller_role <> 'owner' then raise exception 'Assignment denied'; end if;
  if not exists(select 1 from public.business_memberships m where m.business_id=tenant and m.user_id=assignee and m.status='active') then
    raise exception 'Assignment denied';
  end if;
  update public.conversations set handling_mode='human',assigned_to=assignee,taken_over_by=caller,
    taken_over_at=clock_timestamp(),updated_at=clock_timestamp() where id=target_conversation;
end $$;

create function public.handoff_resume_ai(target_conversation uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid();
  tenant uuid;
  assignee uuid;
  caller_role public.business_role;
begin
  if caller is null then raise exception 'Conversation unavailable'; end if;
  select c.business_id,c.assigned_to into tenant,assignee from public.conversations c where c.id=target_conversation for update;
  if tenant is null then raise exception 'Conversation unavailable'; end if;
  select m.role into caller_role
    from public.business_memberships m join public.businesses b on b.id=m.business_id
    where m.business_id=tenant and m.user_id=caller and m.status='active' and b.status='active';
  if caller_role is null or (caller_role <> 'owner' and assignee is distinct from caller) then raise exception 'Conversation unavailable'; end if;
  update public.conversations set handling_mode='ai',assigned_to=null,taken_over_by=null,taken_over_at=null,
    updated_at=clock_timestamp() where id=target_conversation;
end $$;

create function public.handoff_reply(target_conversation uuid, body text, target_request uuid)
returns void language plpgsql security definer set search_path='' as $$
declare
  caller uuid := auth.uid();
  session public.conversations;
  caller_role public.business_role;
begin
  if caller is null or target_request is null or char_length(btrim(coalesce(body,''))) not between 1 and 2000 then
    raise exception 'Reply unavailable';
  end if;
  select * into session from public.conversations c where c.id=target_conversation for update;
  if session.id is null or session.handling_mode <> 'human' then raise exception 'Reply unavailable'; end if;
  select m.role into caller_role
    from public.business_memberships m join public.businesses b on b.id=m.business_id
    where m.business_id=session.business_id and m.user_id=caller and m.status='active' and b.status='active';
  if caller_role is null or (caller_role <> 'owner' and session.assigned_to is distinct from caller) then raise exception 'Reply unavailable'; end if;
  insert into public.messages(business_id,conversation_id,sender,content,request_id,created_by)
    values(session.business_id,session.id,'member',btrim(body),target_request,caller)
    on conflict(conversation_id,request_id,sender) do nothing;
  update public.conversations set updated_at=clock_timestamp() where id=session.id;
end $$;

revoke all on function public.handoff_take_over(uuid,uuid),public.handoff_resume_ai(uuid),public.handoff_reply(uuid,text,uuid) from public,anon;
grant execute on function public.handoff_take_over(uuid,uuid),public.handoff_resume_ai(uuid),public.handoff_reply(uuid,text,uuid) to authenticated;
