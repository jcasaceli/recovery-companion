-- Let facilitators dismiss (delete) a client's alert/note.
drop policy if exists "fac delete notes" on notes;
create policy "fac delete notes" on notes
  for delete using (is_facilitator_for(individual_id));
