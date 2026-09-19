-- Phase 2C-3: minimal tenant settings. Existing policies remain unchanged.
create table public.business_settings (
  business_id uuid primary key references public.businesses(id) on delete cascade,
  locale text not null default 'en-GB' check (
    char_length(locale) between 2 and 35 and
    locale ~ '^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$'
  ),
  lead_notification_email text not null default '' check (
    char_length(lead_notification_email) <= 254 and
    (lead_notification_email = '' or lead_notification_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  notify_new_leads boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.business_settings is 'Tenant-private application preferences. Delivery integrations are not implemented.';

create trigger business_settings_updated before update on public.business_settings
  for each row execute function private.touch_updated_at();

alter table public.business_settings enable row level security;
alter table public.business_settings force row level security;
revoke all on public.business_settings from public, anon, authenticated;
grant select on public.business_settings to authenticated;
grant insert(business_id, locale, lead_notification_email, notify_new_leads) on public.business_settings to authenticated;
grant update(locale, lead_notification_email, notify_new_leads) on public.business_settings to authenticated;

create policy business_settings_read on public.business_settings for select to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy business_settings_insert on public.business_settings for insert to authenticated
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy business_settings_update on public.business_settings for update to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
