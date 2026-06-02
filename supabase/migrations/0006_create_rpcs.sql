-- SECURITY DEFINER RPCs for org + individual creation. These avoid the
-- "insert then select returns the new row" RLS race: a freshly-inserted org has
-- no org_members row yet, so a returning-select fails the SELECT policy. Running
-- the inserts inside a definer function (and returning just the id) sidesteps it.

create or replace function create_organization(p_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_org uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into organizations (name) values (p_name) returning id into new_org;
  insert into org_members (org_id, profile_id, is_owner)
    values (new_org, auth.uid(), true);
  return new_org;
end;
$$;

create or replace function create_individual(
  p_org uuid, p_first text, p_program text, p_start date, p_sobriety date
)
returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not exists (
    select 1 from org_members m where m.org_id = p_org and m.profile_id = auth.uid()
  ) then
    raise exception 'not a member of this organization';
  end if;
  insert into individuals (org_id, first_name, program_name, treatment_start_date, sobriety_date)
    values (p_org, p_first, nullif(p_program, ''), p_start, p_sobriety)
  returning id into new_id;
  return new_id;
end;
$$;
