-- Phase 2A: additive tenant data; Phase 1 policies remain unchanged.
create table public.business_profiles (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  trading_name text not null default '' check (char_length(trading_name) <= 120),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (char_length(email) <= 254),
  website text not null default '' check (char_length(website) <= 2048 and (website = '' or website ~ '^https://[^[:space:]]+$')),
  address text not null default '' check (char_length(address) <= 500),
  description text not null default '' check (char_length(description) <= 3000),
  category text not null default '' check (char_length(category) <= 120),
  logo_alt text not null default '' check (char_length(logo_alt) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.business_profiles.logo_alt is 'Reserved logo description. No upload, external URL fetch, or image rendering in Phase 2A.';
create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text not null default '' check (char_length(description) <= 3000),
  active boolean not null default true,
  starting_price_pence integer check (starting_price_pence between 0 and 100000000),
  quote_required boolean not null default true,
  display_order integer not null default 0 check (display_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index services_business_order on public.services(business_id, display_order, id);

alter table public.business_profiles enable row level security;
alter table public.business_profiles force row level security;
revoke all on public.business_profiles from public, anon, authenticated;
grant select, delete on public.business_profiles to authenticated;
grant insert(business_id,trading_name,phone,email,website,address,description,category,logo_alt) on public.business_profiles to authenticated;
grant update(trading_name,phone,email,website,address,description,category,logo_alt) on public.business_profiles to authenticated;
create trigger business_profiles_updated before update on public.business_profiles for each row execute function private.touch_updated_at();
create policy business_profiles_read on public.business_profiles for select to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy business_profiles_insert on public.business_profiles for insert to authenticated
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy business_profiles_update on public.business_profiles for update to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy business_profiles_delete on public.business_profiles for delete to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]));

alter table public.services enable row level security;
alter table public.services force row level security;
revoke all on public.services from public, anon, authenticated;
grant select, delete on public.services to authenticated;
grant insert(business_id,name,description,active,starting_price_pence,quote_required,display_order) on public.services to authenticated;
grant update(name,description,active,starting_price_pence,quote_required,display_order) on public.services to authenticated;
create trigger services_updated before update on public.services for each row execute function private.touch_updated_at();
create policy services_read on public.services for select to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy services_insert on public.services for insert to authenticated
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy services_update on public.services for update to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy services_delete on public.services for delete to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]));
