-- Cloud-persistent send log for the cold-email campaigns (moved off the Mac).
-- Render's filesystem is ephemeral, so "who have I already emailed" must live
-- here, not in a CSV — otherwise a redeploy would re-email everyone.
--
-- campaign: 'directory' | 'app' | 'app_followup'
-- stage:    0 for an initial send; 1 or 2 for app follow-ups
-- email is always stored lowercased so the unique index dedupes correctly.
create table if not exists campaign_sends (
  id bigint generated always as identity primary key,
  campaign text not null,
  email text not null,
  stage int not null default 0,
  subject text,
  resend_id text,
  homes text,
  sent_at timestamptz not null default now()
);

-- One row per (campaign, email, stage) — makes history import + logging idempotent.
create unique index if not exists campaign_sends_uniq on campaign_sends (campaign, email, stage);
create index if not exists campaign_sends_camp_sent_idx on campaign_sends (campaign, sent_at);

-- Service-role only (the backend). RLS on, no policies -> no anon/authenticated access.
alter table campaign_sends enable row level security;

notify pgrst, 'reload schema';
