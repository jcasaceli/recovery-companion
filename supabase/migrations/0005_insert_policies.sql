-- Add the missing INSERT policies so a facilitator can create their org, add
-- themselves as a member, and create client (individual) records. The original
-- migration only had SELECT/ALL policies that didn't permit these inserts.

-- Any authenticated user may create an organization (they become its owner via
-- the org_members row they insert next).
drop policy if exists "create orgs" on organizations;
create policy "create orgs" on organizations
  for insert with check (auth.uid() is not null);

-- A user may add a membership row only for themselves.
drop policy if exists "join org as self" on org_members;
create policy "join org as self" on org_members
  for insert with check (profile_id = auth.uid());

-- A facilitator may create an individual under an org they belong to.
drop policy if exists "create individuals in my org" on individuals;
create policy "create individuals in my org" on individuals
  for insert with check (
    exists (
      select 1 from org_members m
      where m.org_id = individuals.org_id and m.profile_id = auth.uid()
    )
  );
