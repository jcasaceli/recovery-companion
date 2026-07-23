-- Owners can now name their FIRST house at signup, separately from the org name
-- (the signup form has "Organization name" + "House name"). The house name is
-- passed as signup user-metadata `house_name`; here we read it from the caller's
-- JWT when creating the org's default house. Falls back to the org name (old
-- behavior), then a generic label — so blank house name still works.

create or replace function ensure_default_house()
returns void language plpgsql security definer set search_path = public as $$
declare oid uuid; oname text; hname text; code text;
begin
  select org_id into oid from org_members where profile_id = auth.uid() and is_owner = true limit 1;
  if oid is null then select org_id into oid from org_members where profile_id = auth.uid() limit 1; end if;
  if oid is null then return; end if;

  -- Serialize concurrent callers for this org (see 0051).
  perform pg_advisory_xact_lock(hashtext('house_' || oid::text));

  if exists (select 1 from houses where org_id = oid) then return; end if;

  select coalesce(nullif(name, ''), 'Main House') into oname from organizations where id = oid;
  -- Prefer the house name the owner typed at signup (JWT user metadata).
  hname := coalesce(
    nullif(auth.jwt() -> 'user_metadata' ->> 'house_name', ''),
    oname,
    'Main House'
  );
  code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
  insert into houses (org_id, name, join_code) values (oid, hname, code);
end;
$$;

grant execute on function ensure_default_house() to authenticated;

notify pgrst, 'reload schema';
