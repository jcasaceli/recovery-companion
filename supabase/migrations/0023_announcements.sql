-- Care-team announcements. Facilitators and house managers broadcast messages
-- to everyone in their sober living; residents can read but NOT reply.

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  author_name text,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists announcements_org_idx on announcements (org_id, created_at desc);

alter table announcements enable row level security;

-- Read: staff (org_members) and residents (individuals) of that org.
drop policy if exists "read announcements" on announcements;
create policy "read announcements" on announcements for select using (
  org_id in (select org_id from org_members where profile_id = auth.uid())
  or org_id in (select org_id from individuals where profile_id = auth.uid())
);

-- Write: only staff (facilitators + house managers). Residents have no insert
-- policy, so they cannot post or reply.
drop policy if exists "staff post announcements" on announcements;
create policy "staff post announcements" on announcements for insert with check (
  org_id in (select org_id from org_members where profile_id = auth.uid())
);

drop policy if exists "staff delete announcements" on announcements;
create policy "staff delete announcements" on announcements for delete using (
  org_id in (select org_id from org_members where profile_id = auth.uid())
);

-- Care team for the caller's org (works for residents too, who can't read
-- staff profiles directly under RLS). SECURITY DEFINER, fixed search_path.
create or replace function get_care_team()
returns table(name text, is_owner boolean)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(p.full_name, ''), 'Staff') as name, m.is_owner
  from org_members m
  join profiles p on p.id = m.profile_id
  where m.org_id = coalesce(
    (select org_id from org_members where profile_id = auth.uid() limit 1),
    (select org_id from individuals where profile_id = auth.uid() limit 1)
  )
  order by m.is_owner desc, p.full_name;
$$;

notify pgrst, 'reload schema';
