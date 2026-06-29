-- Anyone who creates or claims a profile through the Sober Living DIRECTORY
-- (signup_source = 'sober_living_listing') is a home owner/operator, so make
-- them a FACILITATOR automatically and give them an organization — instead of
-- the old behavior that left them as an org-less 'individual' (which made the
-- Companion app look broken on login, e.g. info@zionsoberliving.com).
--
-- App residents are UNAFFECTED: they sign up inside the app, which sends an
-- explicit role and never sets signup_source='sober_living_listing'.

-- 1) Signup trigger: directory signups default to facilitator + auto-org.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare new_org uuid; code text; chosen_role app_role;
begin
  -- Explicit role from the app wins; otherwise a directory signer is a
  -- facilitator, and everyone else defaults to individual.
  chosen_role := coalesce(
    (new.raw_user_meta_data->>'role')::app_role,
    case when (new.raw_user_meta_data->>'signup_source') = 'sober_living_listing'
         then 'facilitator'::app_role else 'individual'::app_role end
  );

  insert into public.profiles (id, role, full_name, email, phone, verify_channel, signup_source)
  values (
    new.id,
    chosen_role,
    new.raw_user_meta_data->>'full_name',
    new.email,
    new.raw_user_meta_data->>'phone',
    (new.raw_user_meta_data->>'verify_channel')::verify_channel,
    new.raw_user_meta_data->>'signup_source'
  )
  on conflict (id) do nothing;

  if chosen_role = 'facilitator' then
    code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    insert into organizations (name, created_by, join_code)
    values (coalesce(nullif(new.raw_user_meta_data->>'org_name', ''), 'My Sober Living'), new.id, code)
    returning id into new_org;
    insert into org_members (org_id, profile_id, is_owner) values (new_org, new.id, true);
  end if;
  return new;
end;
$$;

-- 2) set_signup_source: covers Google/Apple directory signups, whose metadata
--    we don't control at insert time. Tag the source (only if unset), and if
--    they're a directory signer who is still an org-less individual, promote
--    them to facilitator + create their org. App residents (who already have an
--    individuals record or an org) are never touched.
create or replace function set_signup_source(src text)
returns void language plpgsql security definer set search_path = public as $$
declare uid uuid; cur_src text; cur_role app_role; has_org boolean; has_ind boolean; new_org uuid; code text;
begin
  uid := auth.uid();
  if uid is null then raise exception 'not authenticated'; end if;

  select signup_source, role into cur_src, cur_role from profiles where id = uid;

  -- Only set source if not already set (never overwrite an app user's source).
  if cur_src is null then
    update profiles set signup_source = src where id = uid;
    cur_src := src;
  end if;

  if src = 'sober_living_listing' and cur_role = 'individual' then
    select exists(select 1 from org_members where profile_id = uid) into has_org;
    select exists(select 1 from individuals where profile_id = uid) into has_ind;
    if not has_org and not has_ind then
      update profiles set role = 'facilitator' where id = uid;
      code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
      insert into organizations (name, created_by, join_code)
      values ('My Sober Living', uid, code)
      returning id into new_org;
      insert into org_members (org_id, profile_id, is_owner) values (new_org, uid, true);
    end if;
  end if;
end;
$$;

-- 3) Backfill: fix existing directory signers who are stuck as org-less
--    individuals (the same class of bug as Zion).
do $$
declare r record; new_org uuid; code text;
begin
  for r in
    select p.id from profiles p
    where p.signup_source = 'sober_living_listing'
      and p.role = 'individual'
      and not exists (select 1 from org_members m where m.profile_id = p.id)
      and not exists (select 1 from individuals i where i.profile_id = p.id)
  loop
    update profiles set role = 'facilitator' where id = r.id;
    code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
    insert into organizations (name, created_by, join_code)
    values ('My Sober Living', r.id, code)
    returning id into new_org;
    insert into org_members (org_id, profile_id, is_owner) values (new_org, r.id, true);
  end loop;
end $$;

notify pgrst, 'reload schema';
