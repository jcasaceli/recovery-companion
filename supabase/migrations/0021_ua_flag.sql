-- A positive (dirty) UA raises a flag visible to facilitators + house managers
-- (not the resident). Either can dismiss it. We model "dismissed" on the test
-- row itself; an active flag = a positive test that hasn't been dismissed.
alter table ua_tests add column if not exists dismissed boolean not null default false;

notify pgrst, 'reload schema';
