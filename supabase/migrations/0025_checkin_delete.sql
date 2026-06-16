-- Let a member delete their own meeting check-ins (e.g. an accidental tap).
drop policy if exists "member deletes own checkin" on meeting_checkins;
create policy "member deletes own checkin" on meeting_checkins
  for delete using (
    exists (select 1 from individuals i where i.id = meeting_checkins.individual_id and i.profile_id = auth.uid())
  );

notify pgrst, 'reload schema';
