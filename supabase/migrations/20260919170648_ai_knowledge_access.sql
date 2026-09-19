-- Read only approved business knowledge, through an existing live chat capability.
-- No grants to anon; no change to membership/owner policies or write permissions.
grant select(id,name,timezone) on public.businesses to codeedge_chat_api;
grant select(business_id,trading_name,phone,email,website,address,description,category) on public.business_profiles to codeedge_chat_api;
grant select(id,business_id,name,description,active,starting_price_pence,quote_required,display_order) on public.services to codeedge_chat_api;
grant select(id,business_id,name,postcode,notes,active,display_order) on public.service_areas to codeedge_chat_api;
grant select(business_id,weekday,is_closed,opens_at,closes_at) on public.opening_hours to codeedge_chat_api;
grant select(id,business_id,question,answer,is_active,display_order) on public.business_faqs to codeedge_chat_api;
grant select(business_id,locale) on public.business_settings to codeedge_chat_api;
create policy chat_business_knowledge on public.businesses for select to codeedge_chat_api using(id=private.chat_business() and private.chat_session() is not null);
create policy chat_profile_knowledge on public.business_profiles for select to codeedge_chat_api using(business_id=private.chat_business() and private.chat_session() is not null);
create policy chat_service_knowledge on public.services for select to codeedge_chat_api using(business_id=private.chat_business() and private.chat_session() is not null and active);
create policy chat_area_knowledge on public.service_areas for select to codeedge_chat_api using(business_id=private.chat_business() and private.chat_session() is not null and active);
create policy chat_hours_knowledge on public.opening_hours for select to codeedge_chat_api using(business_id=private.chat_business() and private.chat_session() is not null);
create policy chat_faq_knowledge on public.business_faqs for select to codeedge_chat_api using(business_id=private.chat_business() and private.chat_session() is not null and is_active);
create policy chat_settings_knowledge on public.business_settings for select to codeedge_chat_api using(business_id=private.chat_business() and private.chat_session() is not null);
