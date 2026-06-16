-- Pass forms: members request overnight or multi-day passes; the facilitator and
-- house managers are notified and approve or deny. Staff turn the feature on for
-- the whole org (all members) or off (no members) via organizations.passes_enabled.

alter table organizations add column if not exists passes_enabled boolean not null default false;

create table if not exists passes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  individual_id uuid not null references individuals(id) on delete cascade,
  house_id uuid references houses(id) on delete set null,
  type text not null,                       -- 'overnight' | 'multi_day'
  start_date date not null,
  end_date date not null,
  return_time text,                         -- "HH:MM" expected return (optional)
  destination text,
  reason text,
  contact_phone text,                       -- where to reach them while out
  status text not null default 'pending',   -- 'pending' | 'approved' | 'denied'
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now()
);

create index if not exists passes_org_idx on passes (org_id, status, created_at desc);
create index if not exists passes_individual_idx on passes (individual_id, created_at desc);

alter table passes enable row level security;

-- Member sees their own; facilitator + managers see their org's.
drop policy if exists "read passes" on passes;
create policy "read passes" on passes for select using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
);

-- A member submits their own pass — only while the feature is enabled for the org.
drop policy if exists "member inserts passes" on passes;
create policy "member inserts passes" on passes for insert with check (
  individual_id in (select id from individuals where profile_id = auth.uid())
  and exists (select 1 from organizations o where o.id = org_id and o.passes_enabled)
);

-- Staff approve / deny (and may edit). Members cannot change status.
drop policy if exists "facilitator updates passes" on passes;
create policy "facilitator updates passes" on passes for update using (
  is_facilitator_for(individual_id)
) with check (is_facilitator_for(individual_id));

-- Staff can remove any; a member may cancel their own (app only offers this while pending).
drop policy if exists "delete passes" on passes;
create policy "delete passes" on passes for delete using (
  is_facilitator_for(individual_id)
  or individual_id in (select id from individuals where profile_id = auth.uid())
);

notify pgrst, 'reload schema';
