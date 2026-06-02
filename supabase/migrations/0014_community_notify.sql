-- Per-user opt-in for community-post push notifications.
alter table profiles add column if not exists community_notify boolean not null default false;
