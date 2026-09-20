-- Phase 3: tenant-secured leads, internal notes and quote requests.
create type public.lead_status as enum ('new', 'contacted', 'qualified', 'won', 'lost');
create type public.quote_request_status as enum ('requested', 'reviewing', 'quoted', 'declined');

alter table public.services add constraint services_business_id_id_unique unique (business_id, id);

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  contact_name text not null check (char_length(btrim(contact_name)) between 1 and 120),
  phone text not null default '' check (char_length(phone) <= 40),
  email text not null default '' check (
    char_length(email) <= 254 and
    (email = '' or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
  ),
  source text not null default 'manual' check (source ~ '^[a-z][a-z0-9_]{0,39}$'),
  service_id uuid,
  enquiry_summary text not null check (char_length(enquiry_summary) <= 3000 and enquiry_summary ~ '[^[:space:]]'),
  status public.lead_status not null default 'new',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leads_contact_method check (phone ~ '[^[:space:]]' or email <> ''),
  constraint leads_service_same_tenant foreign key (business_id, service_id)
    references public.services(business_id, id) on delete set null (service_id)
);
create index leads_business_created on public.leads(business_id, created_at desc, id);
create index leads_business_status_created on public.leads(business_id, status, created_at desc);
create index leads_business_service on public.leads(business_id, service_id) where service_id is not null;
alter table public.leads add constraint leads_business_id_id_unique unique (business_id, id);

create table public.lead_notes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid not null,
  body text not null check (char_length(body) <= 5000 and body ~ '[^[:space:]]'),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_notes_lead_same_tenant foreign key (business_id, lead_id)
    references public.leads(business_id, id) on delete cascade
);
create index lead_notes_business_lead_created on public.lead_notes(business_id, lead_id, created_at, id);

create table public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  lead_id uuid not null,
  details text not null check (char_length(details) <= 5000 and details ~ '[^[:space:]]'),
  status public.quote_request_status not null default 'requested',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quote_requests_lead_same_tenant foreign key (business_id, lead_id)
    references public.leads(business_id, id) on delete cascade
);
create index quote_requests_business_lead_created on public.quote_requests(business_id, lead_id, created_at, id);

create trigger leads_updated before update on public.leads for each row execute function private.touch_updated_at();
create trigger lead_notes_updated before update on public.lead_notes for each row execute function private.touch_updated_at();
create trigger quote_requests_updated before update on public.quote_requests for each row execute function private.touch_updated_at();

alter table public.leads enable row level security;
alter table public.leads force row level security;
alter table public.lead_notes enable row level security;
alter table public.lead_notes force row level security;
alter table public.quote_requests enable row level security;
alter table public.quote_requests force row level security;

revoke all on public.leads, public.lead_notes, public.quote_requests from public, anon, authenticated;

grant select, delete on public.leads to authenticated;
grant insert(business_id,contact_name,phone,email,source,service_id,enquiry_summary,status,created_by) on public.leads to authenticated;
grant update(contact_name,phone,email,source,service_id,enquiry_summary,status) on public.leads to authenticated;

grant select, delete on public.lead_notes to authenticated;
grant insert(business_id,lead_id,body,created_by) on public.lead_notes to authenticated;
grant update(body) on public.lead_notes to authenticated;

grant select, delete on public.quote_requests to authenticated;
grant insert(business_id,lead_id,details,status,created_by) on public.quote_requests to authenticated;
grant update(details,status) on public.quote_requests to authenticated;

create policy leads_read on public.leads for select to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy leads_insert on public.leads for insert to authenticated
  with check (
    created_by = (select auth.uid()) and
    private.has_business_role(business_id, array['owner','staff']::public.business_role[])
  );
create policy leads_update on public.leads for update to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy leads_delete on public.leads for delete to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]));

create policy lead_notes_read on public.lead_notes for select to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy lead_notes_insert on public.lead_notes for insert to authenticated
  with check (
    created_by = (select auth.uid()) and
    private.has_business_role(business_id, array['owner','staff']::public.business_role[])
  );
create policy lead_notes_update on public.lead_notes for update to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy lead_notes_delete on public.lead_notes for delete to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]));

create policy quote_requests_read on public.quote_requests for select to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy quote_requests_insert on public.quote_requests for insert to authenticated
  with check (
    created_by = (select auth.uid()) and
    private.has_business_role(business_id, array['owner','staff']::public.business_role[])
  );
create policy quote_requests_update on public.quote_requests for update to authenticated
  using (private.has_business_role(business_id, array['owner','staff']::public.business_role[]))
  with check (private.has_business_role(business_id, array['owner','staff']::public.business_role[]));
create policy quote_requests_delete on public.quote_requests for delete to authenticated
  using (private.has_business_role(business_id, array['owner']::public.business_role[]));
