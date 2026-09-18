-- Phase 2C-1: FAQ data and security only. Existing policies are unchanged.
create table public.business_faqs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  question text not null check (char_length(question) <= 300 and question ~ '[^[:space:]]'),
  answer text not null check (char_length(answer) <= 5000 and answer ~ '[^[:space:]]'),
  is_active boolean not null default true,
  display_order integer not null default 0 check (display_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.business_faqs is 'Tenant-private plain-text FAQs. is_active is a content flag, never a public access grant.';
create index business_faqs_business_order on public.business_faqs(business_id, display_order, id);
create trigger business_faqs_updated before update on public.business_faqs
  for each row execute function private.touch_updated_at();

alter table public.business_faqs enable row level security;
alter table public.business_faqs force row level security;
revoke all on public.business_faqs from public, anon, authenticated;
grant select, delete on public.business_faqs to authenticated;
grant insert(business_id, question, answer, is_active, display_order) on public.business_faqs to authenticated;
grant update(question, answer, is_active, display_order) on public.business_faqs to authenticated;

create policy business_faqs_read on public.business_faqs for select to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy business_faqs_insert on public.business_faqs for insert to authenticated
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy business_faqs_update on public.business_faqs for update to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner']::public.business_role[]));
create policy business_faqs_delete on public.business_faqs for delete to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]));
