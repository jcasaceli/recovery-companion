-- Make org creation work without an RPC: track the creator and let them SELECT
-- their just-created org (so insert().select() passes RLS on the returned row).
alter table organizations add column if not exists created_by uuid default auth.uid();

drop policy if exists "creator sees org" on organizations;
create policy "creator sees org" on organizations
  for select using (created_by = auth.uid());
