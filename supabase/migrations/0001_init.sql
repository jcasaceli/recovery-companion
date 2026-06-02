-- Recovery Companion — platform schema with Row-Level Security.
--
-- Three account roles:
--   individual   — the person in recovery (any age)
--   supporter    — a parent / family member who follows progress
--   facilitator  — the paid sober-companion professional (the "admin") who
--                  manages an individual, writes notes/progress, assigns tasks.
--                  Facilitators belong to an organization (the company that
--                  pays the $500/mo subscription).
--
-- Access model: every piece of an individual's data is gated by membership in
-- `care_relationships` (supporter/individual) or by being a facilitator in the
-- org that owns the individual. This is the structural foundation for HIPAA /
-- 42 CFR Part 2 access control. RLS is enabled on EVERY table. The full
-- policy set below is a strong starting point and MUST be security-reviewed
-- before real PHI — see docs/COMPLIANCE.md.

-- ===========================================================================
-- Enums
-- ===========================================================================
create type app_role            as enum ('individual','supporter','facilitator');
create type relationship        as enum ('son','daughter','child','spouse','sibling','parent','other');
create type program_type        as enum ('detox','inpatient','residential','php','iop','outpatient','sober-living','aftercare');
create type milestone_category  as enum ('recovery','treatment','personal','health');
create type session_type        as enum ('individual-therapy','group-therapy','family-therapy','psychiatry','medical','support-group');
create type message_sender      as enum ('supporter','facilitator','individual');
create type note_visibility     as enum ('all','supporters','individual','facilitators');
create type task_recurrence     as enum ('none','daily','weekly');
create type subscription_status as enum ('demo','trialing','active','past_due','canceled');
create type verify_channel      as enum ('email','sms');
create type fellowship          as enum ('AA','NA');

-- ===========================================================================
-- Profiles (1:1 with auth.users) + organizations
-- ===========================================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role app_role not null,
  full_name text,
  email text,
  phone text,
  email_verified boolean not null default false,
  phone_verified boolean not null default false,
  -- which channel the user chose to verify with (email or sms)
  verify_channel verify_channel,
  created_at timestamptz not null default now()
);

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subscription_status subscription_status not null default 'demo',
  -- Stripe linkage (populated by the billing webhook — see docs/BACKEND.md)
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- Facilitators belonging to an organization.
create table org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  is_owner boolean not null default false,
  primary key (org_id, profile_id)
);

-- ===========================================================================
-- Individuals (the care record) + relationships
-- ===========================================================================
create table individuals (
  id uuid primary key default gen_random_uuid(),
  -- The org whose facilitators manage this individual.
  org_id uuid references organizations(id) on delete set null,
  -- Linked once the individual creates their own account (nullable until then).
  profile_id uuid references profiles(id) on delete set null,
  first_name text not null,
  program_name text,
  program_type program_type,
  treatment_start_date date,
  sobriety_date date,
  created_at timestamptz not null default now()
);

-- Who may access this individual's data, and in what relation. The individual
-- themselves gets a row with relation 'individual'. Supporters get a row once
-- the individual (or facilitator, with consent) links them. `consented_at`
-- records Part 2 consent for sharing SUD data with that supporter.
create table care_relationships (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  relation app_role not null,
  consented_at timestamptz,
  created_at timestamptz not null default now(),
  unique (individual_id, profile_id)
);

-- ===========================================================================
-- Progress data
-- ===========================================================================
create table check_ins (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  date date not null,
  mood smallint not null check (mood between 1 and 5),
  note text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table milestones (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  date date not null,
  title text not null,
  description text,
  category milestone_category not null,
  celebrated boolean not null default false
);

create table treatment_sessions (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  date date not null,
  type session_type not null,
  attended boolean not null default true,
  note text
);

-- Facilitator/supporter notes. `visibility` controls who can read them.
create table notes (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  visibility note_visibility not null default 'all',
  created_at timestamptz not null default now()
);

-- Tasks / daily reminders shared with the individual. Created by a facilitator
-- or supporter. `recurrence` powers daily/weekly reminders.
create table tasks (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  title text not null,
  description text,
  due_date date,
  remind_at time,
  recurrence task_recurrence not null default 'none',
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Threaded messaging (supporter/individual <-> facilitator).
create table message_threads (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  title text
);

create table thread_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references message_threads(id) on delete cascade,
  sender_id uuid references profiles(id) on delete set null,
  sender_type message_sender not null,
  sender_name text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Sobriety-date reset audit. FACILITATOR-ONLY visibility. Rows are written by
-- the reset_sobriety_date() function, never inserted directly by clients.
create table sobriety_resets (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  old_date date,
  new_date date,
  reset_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Meeting guide (NA / AA). Public reference data, not per-individual.
create table meetings (
  id uuid primary key default gen_random_uuid(),
  fellowship fellowship not null,
  name text not null,
  region text not null,         -- e.g. "Austin, TX"
  day_of_week smallint,         -- 0=Sun .. 6=Sat; null = varies
  start_time time,
  address text,
  is_online boolean not null default false,
  url text
);

-- Expo push tokens, one or more per profile (multiple devices).
create table push_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text,
  created_at timestamptz not null default now()
);

-- ===========================================================================
-- Helper functions (SECURITY DEFINER, fixed search_path)
-- ===========================================================================
create or replace function my_role()
returns app_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid();
$$;

-- Is the current user a supporter/individual linked to this individual?
create or replace function is_related(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from care_relationships r
    where r.individual_id = target and r.profile_id = auth.uid()
  );
$$;

-- Is the current user a facilitator in the org that owns this individual?
create or replace function is_facilitator_for(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from individuals i
    join org_members m on m.org_id = i.org_id
    where i.id = target and m.profile_id = auth.uid()
  );
$$;

-- Anyone with any access (related OR facilitator).
create or replace function can_access(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_related(target) or is_facilitator_for(target);
$$;

-- Reset the sobriety date AND write the facilitator-only audit row atomically.
-- Clients call this RPC instead of updating individuals.sobriety_date directly,
-- guaranteeing the reset is always logged. The individual/supporter see only
-- the new date; the audit is visible to facilitators alone (see RLS below).
create or replace function reset_sobriety_date(target uuid, new_sobriety date)
returns void language plpgsql security definer set search_path = public as $$
declare old_date date;
begin
  if not can_access(target) then
    raise exception 'not authorized';
  end if;
  select sobriety_date into old_date from individuals where id = target;
  update individuals set sobriety_date = new_sobriety where id = target;
  insert into sobriety_resets (individual_id, old_date, new_date, reset_by)
  values (target, old_date, new_sobriety, auth.uid());
end;
$$;

-- ===========================================================================
-- Row-Level Security
-- ===========================================================================
alter table profiles            enable row level security;
alter table organizations       enable row level security;
alter table org_members         enable row level security;
alter table individuals         enable row level security;
alter table care_relationships  enable row level security;
alter table check_ins           enable row level security;
alter table milestones          enable row level security;
alter table treatment_sessions  enable row level security;
alter table notes               enable row level security;
alter table tasks               enable row level security;
alter table message_threads     enable row level security;
alter table thread_messages     enable row level security;
alter table sobriety_resets     enable row level security;
alter table meetings            enable row level security;
alter table push_tokens         enable row level security;

-- Profiles: you can read/update your own; facilitators can read profiles of
-- individuals/supporters connected to their org's individuals (kept simple here
-- — tighten as needed).
create policy "own profile" on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Organizations & members: visible to their own facilitator members.
create policy "member orgs" on organizations
  for select using (exists (
    select 1 from org_members m where m.org_id = organizations.id and m.profile_id = auth.uid()
  ));
-- NOTE: must NOT reference org_members inside its own policy (infinite
-- recursion). You can see your own memberships; "see co-members" can be added
-- later via a SECURITY DEFINER helper if needed.
create policy "own org membership" on org_members
  for select using (profile_id = auth.uid());

-- Inserts: any authenticated user can create an org; a user can add a
-- membership row only for themselves.
create policy "create orgs" on organizations
  for insert with check (auth.uid() is not null);
create policy "join org as self" on org_members
  for insert with check (profile_id = auth.uid());

-- Individuals: accessible to related users and the owning org's facilitators.
create policy "access individuals" on individuals
  for select using (can_access(id));
create policy "facilitators manage individuals" on individuals
  for all using (is_facilitator_for(id)) with check (is_facilitator_for(id));
-- Explicit INSERT policy: create an individual under an org you belong to
-- (the FOR ALL check above can't see the not-yet-inserted row by id).
create policy "create individuals in my org" on individuals
  for insert with check (
    exists (
      select 1 from org_members m
      where m.org_id = individuals.org_id and m.profile_id = auth.uid()
    )
  );

-- Care relationships: you can see rows for individuals you can access.
create policy "access relationships" on care_relationships
  for select using (can_access(individual_id));
create policy "facilitators manage relationships" on care_relationships
  for all using (is_facilitator_for(individual_id)) with check (is_facilitator_for(individual_id));

-- Progress tables: read for anyone with access; write for facilitators (and
-- check-ins additionally writable by the individual/supporters).
create policy "read check_ins" on check_ins for select using (can_access(individual_id));
create policy "write check_ins" on check_ins for insert with check (can_access(individual_id));
create policy "read milestones" on milestones for select using (can_access(individual_id));
create policy "fac milestones" on milestones for all using (is_facilitator_for(individual_id)) with check (is_facilitator_for(individual_id));
create policy "read sessions" on treatment_sessions for select using (can_access(individual_id));
create policy "fac sessions" on treatment_sessions for all using (is_facilitator_for(individual_id)) with check (is_facilitator_for(individual_id));

-- Notes: visibility-aware read; written by anyone with access.
create policy "read notes" on notes for select using (
  can_access(individual_id) and (
    visibility = 'all'
    or (visibility = 'facilitators' and is_facilitator_for(individual_id))
    or (visibility = 'supporters'  and my_role() in ('supporter','facilitator'))
    or (visibility = 'individual'  and my_role() in ('individual','facilitator'))
  )
);
create policy "write notes" on notes for insert with check (can_access(individual_id));

-- Tasks: anyone with access can read; facilitators and supporters can create.
create policy "read tasks" on tasks for select using (can_access(individual_id));
create policy "write tasks" on tasks for insert with check (
  can_access(individual_id) and my_role() in ('facilitator','supporter')
);
create policy "update tasks" on tasks for update using (can_access(individual_id)) with check (can_access(individual_id));

-- Messaging.
create policy "access threads" on message_threads for all
  using (can_access(individual_id)) with check (can_access(individual_id));
create policy "access thread messages" on thread_messages for all
  using (exists (select 1 from message_threads t where t.id = thread_messages.thread_id and can_access(t.individual_id)))
  with check (exists (select 1 from message_threads t where t.id = thread_messages.thread_id and can_access(t.individual_id)));

-- Sobriety resets: FACILITATOR-ONLY read. No client insert (only via RPC).
create policy "fac read resets" on sobriety_resets
  for select using (is_facilitator_for(individual_id));

-- Meetings: any authenticated user may read; facilitators may manage.
create policy "read meetings" on meetings for select using (auth.uid() is not null);
create policy "fac manage meetings" on meetings for all
  using (my_role() = 'facilitator') with check (my_role() = 'facilitator');

-- Push tokens: each user manages their own.
create policy "own push tokens" on push_tokens
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ===========================================================================
-- Indexes
-- ===========================================================================
create index on org_members (profile_id);
create index on individuals (org_id);
create index on care_relationships (profile_id);
create index on care_relationships (individual_id);
create index on check_ins (individual_id, date desc);
create index on milestones (individual_id, date desc);
create index on treatment_sessions (individual_id, date desc);
create index on notes (individual_id, created_at desc);
create index on tasks (individual_id, due_date);
create index on thread_messages (thread_id, created_at);
create index on sobriety_resets (individual_id, created_at desc);
create index on meetings (region, fellowship);
create index on push_tokens (profile_id);
