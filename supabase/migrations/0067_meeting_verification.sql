-- Meeting attendance: online meetings + a location-confirmed badge.
--
-- Two distinct things, deliberately labelled differently:
--
--  * ONLINE (Zoom etc.) — we can only observe that the app stayed open. That is
--    NOT proof of attendance, so these are stored as kind='online' with the
--    minutes observed and NEVER get verified_at set. Staff see them as
--    self-reported.
--
--  * IN PERSON — the resident checks in with location, and ~45 minutes later
--    confirms again. Two location samples that far apart at the same place is
--    real evidence they stayed, so those earn the confirmed badge.

alter table meeting_checkins
  add column if not exists kind text not null default 'in_person',
  add column if not exists online_minutes int,
  add column if not exists verified_at timestamptz,
  add column if not exists verify_latitude double precision,
  add column if not exists verify_longitude double precision,
  add column if not exists verify_distance_m int;

do $$ begin
  alter table meeting_checkins
    add constraint meeting_checkins_kind_check check (kind in ('in_person', 'online'));
exception when duplicate_object then null; end $$;

-- Confirm a resident is still at the meeting they checked into.
--
-- The distance is computed HERE from the stored original and the submitted
-- point, so a client can't just post "distance: 0". (The coordinates themselves
-- are still self-reported — this proves the two samples agree, not that the
-- phone was truthful. Hence "location confirmed", not "verified attendance".)
--
-- Rules: must be your own check-in, in person, still unconfirmed, and the
-- confirmation must land in a sensible window after check-in (30–180 min) so it
-- can't be back-filled the next day. Within 300 m counts as still there.
create or replace function verify_meeting_checkin(p_id uuid, p_lat double precision, p_lng double precision)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c record;
  mins numeric;
  dist_m int;
begin
  select mc.* into c
  from meeting_checkins mc
  join individuals i on i.id = mc.individual_id
  where mc.id = p_id and i.profile_id = auth.uid();

  if c is null then raise exception 'Check-in not found.'; end if;
  if c.kind <> 'in_person' then raise exception 'Only in-person meetings can be confirmed.'; end if;
  if c.verified_at is not null then raise exception 'Already confirmed.'; end if;
  if c.latitude is null or c.longitude is null then
    raise exception 'That check-in has no location to compare against.';
  end if;
  if p_lat is null or p_lng is null then raise exception 'Location is required to confirm.'; end if;

  mins := extract(epoch from (now() - c.created_at)) / 60.0;
  if mins < 30 then raise exception 'Too early — confirm about 45 minutes after checking in.'; end if;
  if mins > 180 then raise exception 'Too late to confirm this meeting.'; end if;

  -- Haversine, metres. Earth radius 6371000.
  dist_m := round(
    2 * 6371000 * asin(
      sqrt(
        power(sin(radians(p_lat - c.latitude) / 2), 2) +
        cos(radians(c.latitude)) * cos(radians(p_lat)) *
        power(sin(radians(p_lng - c.longitude) / 2), 2)
      )
    )
  );

  update meeting_checkins
  set verify_latitude = p_lat,
      verify_longitude = p_lng,
      verify_distance_m = dist_m,
      verified_at = case when dist_m <= 300 then now() else null end
  where id = p_id;

  return jsonb_build_object(
    'confirmed', dist_m <= 300,
    'distance_m', dist_m,
    'minutes', round(mins)
  );
end $$;

revoke all on function verify_meeting_checkin(uuid, double precision, double precision) from public;
grant execute on function verify_meeting_checkin(uuid, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
