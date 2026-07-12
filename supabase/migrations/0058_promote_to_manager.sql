-- Promote an existing resident to a house manager, in one tap. Only the org
-- owner can do it. Changes the resident's profile role to facilitator, adds them
-- to the org's staff, and assigns them to their current house. SECURITY DEFINER
-- because it edits another user's profile + org membership.
create or replace function promote_to_manager(p_individual_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  v_org uuid;
  v_profile uuid;
  v_house uuid;
begin
  select org_id, profile_id, house_id into v_org, v_profile, v_house
    from individuals where id = p_individual_id;
  if v_org is null then return 'not_found'; end if;
  -- Only the org owner may promote someone.
  if not exists (select 1 from org_members where org_id = v_org and profile_id = caller and is_owner) then
    return 'not_authorized';
  end if;
  -- The resident must have created/linked their app account first.
  if v_profile is null then return 'no_account'; end if;
  if v_profile = caller then return 'already_owner'; end if;

  update profiles set role = 'facilitator'::app_role where id = v_profile;
  insert into org_members (org_id, profile_id, is_owner) values (v_org, v_profile, false)
    on conflict (org_id, profile_id) do nothing;
  if v_house is not null then
    insert into house_staff (house_id, profile_id) values (v_house, v_profile)
      on conflict do nothing;
  end if;
  return 'promoted';
end;
$$;

grant execute on function promote_to_manager(uuid) to authenticated;

notify pgrst, 'reload schema';
