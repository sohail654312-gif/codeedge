-- Tenant authorization is enforced with live database membership, never user metadata.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create type public.business_role as enum ('owner', 'staff');
create type public.business_status as enum ('active', 'suspended');
create type public.membership_status as enum ('active', 'revoked');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  status public.business_status not null default 'active',
  timezone text not null default 'Europe/London' check (timezone = 'Europe/London'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.business_memberships (
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.business_role not null,
  status public.membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (business_id, user_id)
);
create index memberships_user_active on public.business_memberships (user_id, business_id) where status = 'active';

create function private.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public, anon, authenticated;
create trigger profiles_updated before update on public.profiles for each row execute function private.touch_updated_at();
create trigger businesses_updated before update on public.businesses for each row execute function private.touch_updated_at();
create trigger memberships_updated before update on public.business_memberships for each row execute function private.touch_updated_at();

create function private.create_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 120));
  return new;
end;
$$;
revoke all on function private.create_profile() from public, anon, authenticated;
create trigger auth_user_created after insert on auth.users for each row execute function private.create_profile();

-- A boolean predicate only: caller identity is always auth.uid(), never a parameter.
-- SECURITY DEFINER avoids recursive membership policies. Keep this schema off the API.
-- Owner is the migration role (postgres), and the fixed search_path prevents shadowing.
create function private.has_business_role(target_business_id uuid, allowed_roles public.business_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.business_memberships m
    join public.businesses b on b.id = m.business_id
    where m.business_id = target_business_id
      and m.user_id = (select auth.uid())
      and m.status = 'active' and b.status = 'active'
      and m.role = any(allowed_roles)
  );
$$;
revoke all on function private.has_business_role(uuid, public.business_role[]) from public, anon;
grant execute on function private.has_business_role(uuid, public.business_role[]) to authenticated;

alter table public.profiles enable row level security;
alter table public.profiles force row level security;
alter table public.businesses enable row level security;
alter table public.businesses force row level security;
alter table public.business_memberships enable row level security;
alter table public.business_memberships force row level security;

-- Undo Supabase default grants explicitly. Column-level UPDATE prevents identity,
-- role, status, slug, tenant ownership, or timestamps from being changed by clients.
revoke all on public.profiles, public.businesses, public.business_memberships from anon, authenticated;
grant select on public.profiles, public.businesses, public.business_memberships to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant update(name) on public.businesses to authenticated;

create policy profiles_read_self on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy businesses_read_member on public.businesses for select to authenticated
  using (private.has_business_role(id, array['owner','staff']::public.business_role[]));
create policy businesses_update_owner on public.businesses for update to authenticated
  using (private.has_business_role(id, array['owner']::public.business_role[]))
  with check (private.has_business_role(id, array['owner']::public.business_role[]));

create policy memberships_read on public.business_memberships for select to authenticated using (
  private.has_business_role(business_id, array['owner']::public.business_role[])
  or (user_id = (select auth.uid()) and private.has_business_role(business_id, array['staff']::public.business_role[]))
);
-- No client INSERT/UPDATE/DELETE membership policies or grants. Provisioning and
-- revocation are trusted maintenance operations until audited owner workflows exist.

-- Future tables/functions must opt into grants instead of inheriting broad access.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
