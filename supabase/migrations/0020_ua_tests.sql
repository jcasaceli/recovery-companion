-- UA (urinalysis / drug test) logs. Facilitators and house managers record a
-- resident's test result; the resident can view their own history.

create table if not exists ua_tests (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  org_id uuid references organizations(id) on delete set null,
  tested_at date not null default current_date,
  result text not null default 'negative' check (result in ('negative','positive','refused','pending')),
  substances text,   -- comma-separated, when positive (e.g. "THC, Opioids")
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists ua_tests_individual_idx on ua_tests (individual_id, tested_at desc);

alter table ua_tests enable row level security;

-- Resident (and facilitator/manager) can read; only facilitators/managers write.
drop policy if exists "read ua_tests" on ua_tests;
create policy "read ua_tests" on ua_tests for select using (can_access(individual_id));

drop policy if exists "facilitator writes ua_tests" on ua_tests;
create policy "facilitator writes ua_tests" on ua_tests
  for all using (is_facilitator_for(individual_id))
  with check (is_facilitator_for(individual_id));

notify pgrst, 'reload schema';
