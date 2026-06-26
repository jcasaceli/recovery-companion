-- One master join code per sober living (the org code), with:
--  • house selection at sign-up (p_house_id),
--  • smart matching: when a resident redeems the code, if the operator already
--    created an unclaimed record for them (matched by email or phone), link to
--    THAT record so their agreements/forms/rent follow — otherwise create a new
--    record. This lets a single code work for both pre-added and self-joining
--    residents.

-- List the houses for a code (org code or a house code) so the app can show a
-- house picker BEFORE the resident is a member (security definer bypasses RLS,
-- read-only and limited to id+name).
create or replace function houses_for_code(p_code text)
returns table(id uuid, name text)
language plpgsql security definer set search_path = public as $$
declare o_id uuid;
begin
  select org_id into o_id from houses where upper(join_code) = upper(p_code) limit 1;
  if o_id is null then
    select id into o_id from organizations where upper(join_code) = upper(p_code) limit 1;
  end if;
  if o_id is null then return; end if;
  return query select h.id, h.name from houses h where h.org_id = o_id order by h.created_at;
end;
$$;

create or replace function redeem_org_code(p_code text, p_house_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare h_id uuid; o_id uuid; iid uuid; nm text; em text; ph text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  -- Already linked? Optionally move them to the chosen house, then return.
  select id into iid from individuals where profile_id = auth.uid() limit 1;
  if iid is not null then
    if p_house_id is not null then update individuals set house_id = p_house_id where id = iid; end if;
    return iid;
  end if;

  -- Resolve the org (and the code's house, if it was a house code).
  select id, org_id into h_id, o_id from houses where upper(join_code) = upper(p_code) limit 1;
  if o_id is null then
    select id into o_id from organizations where upper(join_code) = upper(p_code) limit 1;
    if o_id is null then raise exception 'Invalid join code'; end if;
  end if;

  -- House: explicit pick (validated to this org) > code's house > first house.
  if p_house_id is not null and exists (select 1 from houses where id = p_house_id and org_id = o_id) then
    h_id := p_house_id;
  end if;
  if h_id is null then
    select id into h_id from houses where org_id = o_id order by created_at limit 1;
  end if;

  -- Smart match: claim an unclaimed record the operator already created for me
  -- (matched by email or phone) so agreements/forms/rent follow.
  select email, phone into em, ph from profiles where id = auth.uid();
  select id into iid from individuals
    where org_id = o_id and profile_id is null
      and (
        (nullif(em, '') is not null and lower(coalesce(email, '')) = lower(em)) or
        (nullif(ph, '') is not null and nullif(phone, '') = ph)
      )
    order by created_at limit 1;

  if iid is not null then
    update individuals set profile_id = auth.uid(), house_id = coalesce(h_id, house_id) where id = iid;
  else
    select coalesce(nullif(full_name, ''), 'Member') into nm from profiles where id = auth.uid();
    insert into individuals (org_id, house_id, profile_id, first_name, level_of_care, status)
    values (o_id, h_id, auth.uid(), split_part(nm, ' ', 1), 'sober_living', 'in_care')
    returning id into iid;
  end if;

  insert into care_relationships (individual_id, profile_id, relation, consented_at)
  values (iid, auth.uid(), 'individual', now())
  on conflict (individual_id, profile_id) do nothing;
  return iid;
end;
$$;

notify pgrst, 'reload schema';
