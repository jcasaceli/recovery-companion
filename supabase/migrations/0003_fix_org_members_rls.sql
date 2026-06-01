-- Fix: the original org_members SELECT policy referenced org_members inside
-- itself, causing "infinite recursion detected in policy" (HTTP 500). Replace
-- it with a non-recursive policy.
drop policy if exists "own org membership" on org_members;
create policy "own org membership" on org_members
  for select using (profile_id = auth.uid());
