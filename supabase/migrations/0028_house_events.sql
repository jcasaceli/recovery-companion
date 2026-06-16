-- House meetings / mandatory events. Facilitators & house managers add events
-- to a house; every member in that house sees them on their Home screen.
create table if not exists house_events (
  id uuid primary key default gen_random_uuid(),
  house_id uuid not null references houses(id) on delete cascade,
  title text not null,
  event_date date not null,
  event_time text,                       -- "19:00" (optional)
  mandatory boolean not null default false,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists house_events_idx on house_events (house_id, event_date);

alter table house_events enable row level security;

-- Read: members of that house + any staff in the house's org.
drop policy if exists "read house_events" on house_events;
create policy "read house_events" on house_events for select using (
  house_id in (select house_id from individuals where profile_id = auth.uid())
  or house_id in (select id from houses h where h.org_id in (select org_id from org_members where profile_id = auth.uid()))
);

-- Write: staff (facilitators + house managers) in the house's org.
drop policy if exists "staff writes house_events" on house_events;
create policy "staff writes house_events" on house_events for all
  using (house_id in (select id from houses h where h.org_id in (select org_id from org_members where profile_id = auth.uid())))
  with check (house_id in (select id from houses h where h.org_id in (select org_id from org_members where profile_id = auth.uid())));

notify pgrst, 'reload schema';
