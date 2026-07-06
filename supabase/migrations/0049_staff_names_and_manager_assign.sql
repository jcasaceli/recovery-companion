-- Two fixes:
-- 1. get_org_staff(): a SECURITY DEFINER roster of the caller's org staff WITH
--    their real names, so care notes show "Manager Jane Doe" instead of the
--    "Care team" placeholder (the embedded profiles join was being hidden by
--    profile RLS when one staffer viewed another staffer's note).
-- 2. Let ANY house manager (not just the owner) assign/unassign managers to
--    houses, so managers can organize who covers which home.

create or replace function get_org_staff()
returns table(profile_id uuid, full_name text, is_owner boolean)
language sql security definer set search_path = public as $$
  select om.profile_id, p.full_name, om.is_owner
  from org_members om
  join profiles p on p.id = om.profile_id
  where om.org_id in (select org_id from org_members where profile_id = auth.uid());
$$;

grant execute on function get_org_staff() to authenticated;

-- Any staff member of the org can now write house_staff assignments (was owner-only).
drop policy if exists "owner writes house_staff" on house_staff;
drop policy if exists "staff writes house_staff" on house_staff;
create policy "staff writes house_staff" on house_staff for all
  using (house_id in (select id from houses h where h.org_id in (select org_id from org_members where profile_id = auth.uid())))
  with check (house_id in (select id from houses h where h.org_id in (select org_id from org_members where profile_id = auth.uid())));

notify pgrst, 'reload schema';
