-- Community feed + scheduler.

-- Facilitator-controlled flag: may this individual use the community feed?
-- (Some people in treatment can't share photos.) Off by default.
alter table individuals add column community_access boolean not null default false;

create table community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references profiles(id) on delete cascade,
  body text not null default '',
  image_path text,                       -- Supabase Storage object path
  created_at timestamptz not null default now()
);

create table post_likes (
  post_id uuid not null references community_posts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  primary key (post_id, profile_id)
);

-- Schedule events for an individual (manual or extracted from a facilitator's
-- photo of a program schedule).
create table schedule_events (
  id uuid primary key default gen_random_uuid(),
  individual_id uuid not null references individuals(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  title text not null,
  date date not null,
  start_time time,
  end_time time,
  location text,
  source text not null default 'manual', -- 'manual' | 'photo'
  created_at timestamptz not null default now()
);

alter table community_posts enable row level security;
alter table post_likes      enable row level security;
alter table schedule_events enable row level security;

-- Community: an individual may post only if their record has community_access.
-- A post is authored by a profile; the gate checks any individual record the
-- author is the individual for. Feed is readable by authenticated users (a
-- shared recovery community). Tighten to a per-community scope as you grow.
create policy "read posts" on community_posts
  for select using (auth.uid() is not null);
create policy "author may post when allowed" on community_posts
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from individuals i
      where i.profile_id = auth.uid() and i.community_access = true
    )
  );
create policy "delete own posts" on community_posts
  for delete using (author_id = auth.uid());

create policy "read likes" on post_likes for select using (auth.uid() is not null);
create policy "own likes" on post_likes
  for all using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Schedule: anyone with access to the individual can read; facilitators and
-- supporters can add.
create policy "read schedule" on schedule_events
  for select using (can_access(individual_id));
create policy "write schedule" on schedule_events
  for insert with check (
    can_access(individual_id) and my_role() in ('facilitator','supporter')
  );

create index on community_posts (created_at desc);
create index on schedule_events (individual_id, date);
