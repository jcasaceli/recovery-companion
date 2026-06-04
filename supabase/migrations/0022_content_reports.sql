-- Content moderation: let any signed-in user report a community post as
-- objectionable. Required by Apple's UGC guideline (report mechanism). Blocking
-- a user is handled on-device. Operators review reports out-of-band.
create table if not exists content_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references community_posts(id) on delete cascade,
  reporter_id uuid references profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

alter table content_reports enable row level security;

drop policy if exists "insert own report" on content_reports;
create policy "insert own report" on content_reports
  for insert with check (reporter_id = auth.uid());

notify pgrst, 'reload schema';
