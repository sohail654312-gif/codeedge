begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(14);

insert into auth.users(id,email,raw_user_meta_data) values
('40000000-0000-4000-8000-000000000001','tap-a@codeedge.test','{}'),
('40000000-0000-4000-8000-000000000002','tap-b@codeedge.test','{}');
insert into public.businesses(id,name,slug) values
('50000000-0000-4000-8000-000000000001','pgTAP Business A','pgtap-business-a'),
('50000000-0000-4000-8000-000000000002','pgTAP Business B','pgtap-business-b');
insert into public.business_memberships(business_id,user_id,role) values
('50000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','owner'),
('50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','owner');

set local role authenticated;
set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000001';
select is((select count(*) from public.businesses where slug='pgtap-business-a'),1::bigint,'A reads A');
select is((select count(*) from public.businesses where slug='pgtap-business-b'),0::bigint,'A cannot read B');
select is((select count(*) from public.business_memberships where business_id='50000000-0000-4000-8000-000000000002'),0::bigint,'A cannot read B memberships');
select lives_ok($$update public.businesses set name='Renamed A' where slug='pgtap-business-a'$$,'owner can update own name');
select is((select name from public.businesses where slug='pgtap-business-a'),'Renamed A','own edit persisted');
select throws_ok($$update public.business_memberships set role='owner'$$,'42501',null,'membership changes denied');

set local request.jwt.claim.sub = '40000000-0000-4000-8000-000000000002';
select is((select count(*) from public.businesses where slug='pgtap-business-b'),1::bigint,'B reads B');
select is((select count(*) from public.businesses where slug='pgtap-business-a'),0::bigint,'B cannot read A');
select is((select count(*) from public.business_memberships where business_id='50000000-0000-4000-8000-000000000001'),0::bigint,'B cannot read A memberships');

reset role;
update public.business_memberships set status='revoked' where user_id='40000000-0000-4000-8000-000000000002';
set local role authenticated;
select is((select count(*) from public.businesses),0::bigint,'revocation removes access with unchanged claims');
select is((select count(*) from public.business_memberships),0::bigint,'revocation hides memberships');

set local role anon;
set local request.jwt.claim.sub = '';
select throws_ok('select * from public.businesses','42501',null,'anonymous business access denied');
select throws_ok('select * from public.business_memberships','42501',null,'anonymous membership access denied');
reset role;
select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','businesses','business_memberships') and c.relrowsecurity and c.relforcerowsecurity),3::bigint,'RLS enabled and forced');
select * from finish();
rollback;
