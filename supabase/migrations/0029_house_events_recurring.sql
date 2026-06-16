-- Weekly-recurring house meetings: when true, the event repeats every week on
-- the same weekday and keeps showing on members' Home screens.
alter table house_events add column if not exists recurring boolean not null default false;
notify pgrst, 'reload schema';
