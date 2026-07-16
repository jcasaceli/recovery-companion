-- Let a resident maintain their OWN medication list from the app.
--
-- individuals has "member sees own record" (SELECT only) — deliberately, since a
-- blanket UPDATE policy on their row would also let them change status, rent,
-- discharge_date, etc. So instead we expose one narrow, column-scoped RPC:
-- it only ever writes `medications`, and only on the caller's own row.
--
-- Staff keep editing medications directly (facilitators manage individuals).

create or replace function set_my_medications(p_meds jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  iid uuid;
  cleaned jsonb;
begin
  select id into iid from individuals where profile_id = auth.uid() limit 1;
  if iid is null then
    raise exception 'You are not linked to a sober living yet.';
  end if;
  if p_meds is null or jsonb_typeof(p_meds) <> 'array' then
    raise exception 'medications must be a JSON array of text';
  end if;

  -- Keep only non-empty trimmed strings, de-duplicated, order preserved.
  select coalesce(jsonb_agg(v order by ord), '[]'::jsonb) into cleaned
  from (
    select distinct on (btrim(value)) btrim(value) as v, ord
    from jsonb_array_elements_text(p_meds) with ordinality as t(value, ord)
    where btrim(value) <> ''
    order by btrim(value), ord
  ) s;

  update individuals set medications = cleaned where id = iid;
  return cleaned;
end $$;

revoke all on function set_my_medications(jsonb) from public;
grant execute on function set_my_medications(jsonb) to authenticated;

notify pgrst, 'reload schema';
