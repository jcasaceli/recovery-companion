-- Self-serve duplicate cleanup: merge one resident record into another. Moves
-- the login + all child data from p_merge into p_keep, then deletes p_merge.
-- SECURITY DEFINER but authorization-checked: caller must be staff of the org,
-- and both members must be in that same org.
create or replace function merge_individuals(p_keep uuid, p_merge uuid)
returns void language plpgsql security definer set search_path = public as $$
declare keep_org uuid; merge_org uuid; keep_prof uuid; merge_prof uuid; t text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if p_keep = p_merge then raise exception 'cannot merge a member into itself'; end if;

  select org_id, profile_id into keep_org, keep_prof from individuals where id = p_keep;
  select org_id, profile_id into merge_org, merge_prof from individuals where id = p_merge;
  if keep_org is null or merge_org is null then raise exception 'member not found'; end if;
  if keep_org <> merge_org then raise exception 'members are in different orgs'; end if;
  if not exists (select 1 from org_members where org_id = keep_org and profile_id = auth.uid()) then
    raise exception 'not authorized';
  end if;

  -- Move the resident's login to the survivor if it doesn't have one.
  if keep_prof is null and merge_prof is not null then
    update individuals set profile_id = null where id = p_merge;
    update individuals set profile_id = merge_prof where id = p_keep;
  end if;

  -- care_relationships has unique(individual_id, profile_id): drop would-be dupes first.
  delete from care_relationships cr
    where cr.individual_id = p_merge
      and exists (select 1 from care_relationships k where k.individual_id = p_keep and k.profile_id = cr.profile_id);
  update care_relationships set individual_id = p_keep where individual_id = p_merge;

  -- Reassign every other table that references individual_id (skip missing ones).
  for t in select unnest(array[
      'agreements','form_responses','payments','notes','meeting_checkins','documents',
      'ua_tests','passes','curfew_checkins','schedule_events','meeting_attendance','house_events'
    ]) loop
    if to_regclass('public.' || t) is not null
       and exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = 'individual_id') then
      execute format('update %I set individual_id = $1 where individual_id = $2', t) using p_keep, p_merge;
    end if;
  end loop;

  delete from individuals where id = p_merge;
end;
$$;

notify pgrst, 'reload schema';
