-- Curfew check-ins with GPS: staff enable curfew for SPECIFIC members and set the
-- times they must check in by. The member checks in from the app (capturing their
-- GPS location), and staff see compliance + where each check-in came from.

create table if not exists curfews (
  individual_id uuid primary key references individuals(id) on delete cascade,
  enabled boolean not null default true,
  times jsonb not null default '[]',        -- array of "HH:MM" check-in times
  created_by uuid references profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table curfews enable row level security;

-- Member can read their own curfew (to know they have one + the times); staff manage.
drop policy if exists "read curfews" on curfews;
create policy "read curfews" on curfews for select using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
);
drop policy if exists "staff writes curfews" on curfews;
create policy "staff writes curfews" on curfews for all
  using (is_facilitator_for(individual_id))
  with check (is_facilitator_for(individual_id));

create table if not exists curfew_checkins (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  checked_at timestamptz not null default now(),
  latitude double precision,
  longitude double precision,
  address text,
  created_at timestamptz not null default now()
);

create index if not exists curfew_checkins_idx on curfew_checkins (individual_id, checked_at desc);

alter table curfew_checkins enable row level security;

drop policy if exists "read curfew_checkins" on curfew_checkins;
create policy "read curfew_checkins" on curfew_checkins for select using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
);

-- A member logs their own check-in.
drop policy if exists "member inserts curfew_checkins" on curfew_checkins;
create policy "member inserts curfew_checkins" on curfew_checkins for insert with check (
  individual_id in (select id from individuals where profile_id = auth.uid())
);

drop policy if exists "delete curfew_checkins" on curfew_checkins;
create policy "delete curfew_checkins" on curfew_checkins for delete using (
  is_facilitator_for(individual_id)
);

notify pgrst, 'reload schema';
