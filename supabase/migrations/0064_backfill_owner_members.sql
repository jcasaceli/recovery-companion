-- Backfill: every org's founder must have an org_members row with is_owner=true.
--
-- The app used to decide "am I the owner?" from organizations.created_by. That
-- can only ever match the founder, so a co-owner would get RLS access but still
-- see the manager-only Settings screen. The check now reads org_members.is_owner
-- instead — which means any founder missing that row would lose owner access.
--
-- As of this migration every live org already satisfies this, so it inserts 0
-- rows today. The 11 orgs without a membership row are orphans whose founding
-- auth user was deleted — they have no profiles row, so the join below skips
-- them (org_members.profile_id references profiles, and inserting a dangling id
-- would fail the FK). They already have no RLS access either, since
-- is_facilitator_for() joins org_members. This exists to keep the invariant true
-- for any org created before is_owner, and is safe to re-run.

insert into org_members (org_id, profile_id, is_owner)
select o.id, o.created_by, true
from organizations o
join profiles p on p.id = o.created_by   -- skip orgs whose founder was deleted
where not exists (
    select 1 from org_members m
    where m.org_id = o.id and m.profile_id = o.created_by
  )
on conflict (org_id, profile_id) do nothing;

-- A founder who was demoted to a plain member row is still the founder.
update org_members m
set is_owner = true
from organizations o
where o.id = m.org_id and o.created_by = m.profile_id and m.is_owner is not true;
