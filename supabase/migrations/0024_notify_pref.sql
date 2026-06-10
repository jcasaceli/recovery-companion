-- Facilitators/house managers can mute routine resident-activity notifications
-- (meeting check-ins, payment reports). SOS and resident alerts ignore this.
alter table profiles add column if not exists notify_member_activity boolean not null default true;

notify pgrst, 'reload schema';
