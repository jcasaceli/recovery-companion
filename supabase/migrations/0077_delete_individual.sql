-- Hard-delete a resident and ALL of their child rows (payments, notes, passes,
-- documents, curfews, meeting check-ins, forms, agreements, UA tests, etc.).
-- Powers the Members-list "Remove selected" bulk action so operators can clean
-- up a bad import (e.g. a competitor export that pulled every past client).
--
-- SECURITY DEFINER so it can remove rows across tables regardless of per-table
-- RLS — but it FIRST verifies the caller is a facilitator/manager for that
-- resident's org via is_facilitator_for(), so no one can delete another org's
-- residents. The linked auth profile (if any) is intentionally left untouched.
create or replace function delete_individual(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  if not is_facilitator_for(p_id) then
    raise exception 'not authorized to delete this resident';
  end if;

  -- Remove child rows from every public table that references the resident,
  -- discovered dynamically so new resident-scoped tables are covered too.
  for r in
    select table_name
      from information_schema.columns
     where table_schema = 'public'
       and column_name = 'individual_id'
       and table_name <> 'individuals'
  loop
    execute format('delete from public.%I where individual_id = $1', r.table_name) using p_id;
  end loop;

  delete from public.individuals where id = p_id;
end;
$$;

grant execute on function delete_individual(uuid) to authenticated;

notify pgrst, 'reload schema';
