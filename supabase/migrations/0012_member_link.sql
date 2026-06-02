-- Member linking via a per-member join code.
-- The facilitator reveals a short code for a resident; the member enters it once
-- to tie their account (profile) to that resident record.

alter table individuals add column if not exists join_code text unique;

-- Member redeems a code → links their profile to the matching unclaimed record.
-- SECURITY DEFINER because the member can't see/modify a record they aren't
-- linked to yet (RLS). Validates the code and that it isn't already used.
create or replace function redeem_join_code(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare iid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select id into iid from individuals
    where upper(join_code) = upper(p_code) and profile_id is null
    limit 1;
  if iid is null then raise exception 'Invalid or already-used code'; end if;
  update individuals set profile_id = auth.uid() where id = iid;
  insert into care_relationships (individual_id, profile_id, relation, consented_at)
    values (iid, auth.uid(), 'individual', now())
    on conflict (individual_id, profile_id) do nothing;
  return iid;
end;
$$;

notify pgrst, 'reload schema';
