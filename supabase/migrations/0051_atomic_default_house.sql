-- Prevent duplicate "default" houses. The app used to check-then-create the
-- first house client-side, which races: two app loads (or web + phone) could
-- both see zero houses and each insert one, leaving two houses named after the
-- org (e.g. two "My Sober Living"). This RPC does it atomically with a per-org
-- advisory lock, so only ever one default house is created.

create or replace function ensure_default_house()
returns void language plpgsql security definer set search_path = public as $$
declare oid uuid; oname text; code text;
begin
  select org_id into oid from org_members where profile_id = auth.uid() and is_owner = true limit 1;
  if oid is null then select org_id into oid from org_members where profile_id = auth.uid() limit 1; end if;
  if oid is null then return; end if;

  -- Serialize concurrent callers for this org so the "does a house exist?" check
  -- and the insert happen without a race window.
  perform pg_advisory_xact_lock(hashtext('house_' || oid::text));

  if exists (select 1 from houses where org_id = oid) then return; end if;

  select coalesce(nullif(name, ''), 'Main House') into oname from organizations where id = oid;
  code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
  insert into houses (org_id, name, join_code) values (oid, oname, code);
end;
$$;

grant execute on function ensure_default_house() to authenticated;

notify pgrst, 'reload schema';
